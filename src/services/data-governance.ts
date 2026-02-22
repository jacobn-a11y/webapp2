/**
 * Data Governance Service
 *
 * Manages:
 * - Data retention scheduling and execution
 * - Legal hold enforcement
 * - Deletion requests with approval workflow
 * - PII export controls
 * - Governance policy management
 */

import type { PrismaClient } from "@prisma/client";
import logger from "../lib/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GovernancePolicy {
  retentionDays: number;
  legalHoldEnabled: boolean;
  piiExportEnabled: boolean;
  deletionRequiresApproval: boolean;
  allowNamedStoryExports: boolean;
  autoDeleteAfterRetention: boolean;
  retentionExemptAccountIds: string[];
}

export interface RetentionJobRecord {
  id: string;
  organizationId: string;
  status: string;
  targetType: string;
  totalRecords: number;
  processedRecords: number;
  deletedRecords: number;
  skippedRecords: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface LegalHoldRecord {
  id: string;
  organizationId: string;
  scope: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  holdStartedAt: Date;
  holdEndedAt: Date | null;
  createdById: string;
  active: boolean;
}

export interface DeletionRequestRecord {
  id: string;
  organizationId: string;
  requestedById: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  approvedById: string | null;
  approvedAt: Date | null;
  executedAt: Date | null;
  rejectedReason: string | null;
  createdAt: Date;
}

const DEFAULT_POLICY: GovernancePolicy = {
  retentionDays: 365,
  legalHoldEnabled: false,
  piiExportEnabled: true,
  deletionRequiresApproval: true,
  allowNamedStoryExports: false,
  autoDeleteAfterRetention: false,
  retentionExemptAccountIds: [],
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class DataGovernanceService {
  constructor(private prisma: PrismaClient) {}

  // ─── Policy Management ─────────────────────────────────────────────────

  async getPolicy(organizationId: string): Promise<GovernancePolicy> {
    const settings = await this.prisma.orgSettings.findUnique({
      where: { organizationId },
      select: { dataGovernancePolicy: true },
    });

    const raw = (settings?.dataGovernancePolicy ?? {}) as Record<string, unknown>;
    return {
      retentionDays: (raw.retention_days as number) ?? DEFAULT_POLICY.retentionDays,
      legalHoldEnabled: (raw.legal_hold_enabled as boolean) ?? DEFAULT_POLICY.legalHoldEnabled,
      piiExportEnabled: (raw.pii_export_enabled as boolean) ?? DEFAULT_POLICY.piiExportEnabled,
      deletionRequiresApproval: (raw.deletion_requires_approval as boolean) ?? DEFAULT_POLICY.deletionRequiresApproval,
      allowNamedStoryExports: (raw.allow_named_story_exports as boolean) ?? DEFAULT_POLICY.allowNamedStoryExports,
      autoDeleteAfterRetention: (raw.auto_delete_after_retention as boolean) ?? DEFAULT_POLICY.autoDeleteAfterRetention,
      retentionExemptAccountIds: (raw.retention_exempt_account_ids as string[]) ?? DEFAULT_POLICY.retentionExemptAccountIds,
    };
  }

  async updatePolicy(organizationId: string, updates: Partial<GovernancePolicy>): Promise<GovernancePolicy> {
    const current = await this.getPolicy(organizationId);
    const merged = { ...current, ...updates };

    await this.prisma.orgSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        dataGovernancePolicy: {
          retention_days: merged.retentionDays,
          legal_hold_enabled: merged.legalHoldEnabled,
          pii_export_enabled: merged.piiExportEnabled,
          deletion_requires_approval: merged.deletionRequiresApproval,
          allow_named_story_exports: merged.allowNamedStoryExports,
          auto_delete_after_retention: merged.autoDeleteAfterRetention,
          retention_exempt_account_ids: merged.retentionExemptAccountIds,
        },
      },
      update: {
        dataGovernancePolicy: {
          retention_days: merged.retentionDays,
          legal_hold_enabled: merged.legalHoldEnabled,
          pii_export_enabled: merged.piiExportEnabled,
          deletion_requires_approval: merged.deletionRequiresApproval,
          allow_named_story_exports: merged.allowNamedStoryExports,
          auto_delete_after_retention: merged.autoDeleteAfterRetention,
          retention_exempt_account_ids: merged.retentionExemptAccountIds,
        },
      },
    });

    return merged;
  }

  // ─── Retention Jobs ────────────────────────────────────────────────────

  async createRetentionJob(
    organizationId: string,
    targetType: string
  ): Promise<RetentionJobRecord> {
    const policy = await this.getPolicy(organizationId);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    const job = await (this.prisma as any).retentionJob.create({
      data: {
        organizationId,
        status: "PENDING",
        targetType,
        cutoffDate,
        totalRecords: 0,
        processedRecords: 0,
        deletedRecords: 0,
        skippedRecords: 0,
      },
    });

    return this.mapRetentionJob(job);
  }

  async executeRetentionJob(jobId: string): Promise<RetentionJobRecord> {
    const job = await (this.prisma as any).retentionJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error("Retention job not found");

    await (this.prisma as any).retentionJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const policy = await this.getPolicy(job.organizationId);
    let deleted = 0;
    let skipped = 0;
    let processed = 0;

    try {
      if (job.targetType === "transcripts") {
        const result = await this.retainTranscripts(job.organizationId, job.cutoffDate, policy);
        deleted = result.deleted;
        skipped = result.skipped;
        processed = result.processed;
      } else if (job.targetType === "calls") {
        const result = await this.retainCalls(job.organizationId, job.cutoffDate, policy);
        deleted = result.deleted;
        skipped = result.skipped;
        processed = result.processed;
      } else if (job.targetType === "audit_logs") {
        const result = await this.retainAuditLogs(job.organizationId, job.cutoffDate);
        deleted = result.deleted;
        skipped = result.skipped;
        processed = result.processed;
      }

      await (this.prisma as any).retentionJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          processedRecords: processed,
          deletedRecords: deleted,
          skippedRecords: skipped,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      await (this.prisma as any).retentionJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          completedAt: new Date(),
        },
      });
      throw err;
    }

    return this.mapRetentionJob(
      await (this.prisma as any).retentionJob.findUnique({ where: { id: jobId } })
    );
  }

  async getRetentionJobs(organizationId: string): Promise<RetentionJobRecord[]> {
    const jobs = await (this.prisma as any).retentionJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return jobs.map((j: any) => this.mapRetentionJob(j));
  }

  // ─── Legal Holds ──────────────────────────────────────────────────────

  async createLegalHold(params: {
    organizationId: string;
    scope: string;
    targetType: string;
    targetId?: string;
    reason: string;
    createdById: string;
  }): Promise<LegalHoldRecord> {
    const hold = await (this.prisma as any).legalHold.create({
      data: {
        organizationId: params.organizationId,
        scope: params.scope,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        reason: params.reason,
        createdById: params.createdById,
        active: true,
        holdStartedAt: new Date(),
      },
    });

    logger.info("Legal hold created", {
      holdId: hold.id,
      targetType: params.targetType,
      targetId: params.targetId,
    });

    return this.mapLegalHold(hold);
  }

  async releaseLegalHold(holdId: string): Promise<void> {
    await (this.prisma as any).legalHold.update({
      where: { id: holdId },
      data: { active: false, holdEndedAt: new Date() },
    });
  }

  async getActiveLegalHolds(organizationId: string): Promise<LegalHoldRecord[]> {
    const holds = await (this.prisma as any).legalHold.findMany({
      where: { organizationId, active: true },
      orderBy: { holdStartedAt: "desc" },
    });
    return holds.map((h: any) => this.mapLegalHold(h));
  }

  async isUnderLegalHold(
    organizationId: string,
    targetType: string,
    targetId: string
  ): Promise<boolean> {
    const hold = await (this.prisma as any).legalHold.findFirst({
      where: {
        organizationId,
        active: true,
        OR: [
          { scope: "ORGANIZATION" },
          { targetType, targetId },
          { targetType, targetId: null },
        ],
      },
    });
    return !!hold;
  }

  // ─── Deletion Requests ─────────────────────────────────────────────────

  async requestDeletion(params: {
    organizationId: string;
    requestedById: string;
    targetType: string;
    targetId: string;
    reason: string;
  }): Promise<DeletionRequestRecord> {
    // Check legal hold
    const underHold = await this.isUnderLegalHold(
      params.organizationId,
      params.targetType,
      params.targetId
    );
    if (underHold) {
      throw new Error("Cannot delete: resource is under legal hold");
    }

    const policy = await this.getPolicy(params.organizationId);

    const request = await (this.prisma as any).deletionRequest.create({
      data: {
        organizationId: params.organizationId,
        requestedById: params.requestedById,
        targetType: params.targetType,
        targetId: params.targetId,
        reason: params.reason,
        status: policy.deletionRequiresApproval ? "PENDING_APPROVAL" : "APPROVED",
        ...(policy.deletionRequiresApproval ? {} : {
          approvedById: params.requestedById,
          approvedAt: new Date(),
        }),
      },
    });

    if (!policy.deletionRequiresApproval) {
      // Auto-execute if no approval needed
      await this.executeDeletion(request.id);
    }

    return this.mapDeletionRequest(request);
  }

  async approveDeletion(requestId: string, approvedById: string): Promise<void> {
    await (this.prisma as any).deletionRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        approvedById,
        approvedAt: new Date(),
      },
    });
    await this.executeDeletion(requestId);
  }

  async rejectDeletion(requestId: string, rejectedById: string, reason: string): Promise<void> {
    await (this.prisma as any).deletionRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        approvedById: rejectedById,
        rejectedReason: reason,
      },
    });
  }

  async getDeletionRequests(
    organizationId: string,
    status?: string
  ): Promise<DeletionRequestRecord[]> {
    const requests = await (this.prisma as any).deletionRequest.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return requests.map((r: any) => this.mapDeletionRequest(r));
  }

  // ─── PII Export Controls ───────────────────────────────────────────────

  async canExportPii(organizationId: string): Promise<boolean> {
    const policy = await this.getPolicy(organizationId);
    return policy.piiExportEnabled;
  }

  async canExportNamedStories(organizationId: string): Promise<boolean> {
    const policy = await this.getPolicy(organizationId);
    return policy.allowNamedStoryExports;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private async executeDeletion(requestId: string): Promise<void> {
    const request = await (this.prisma as any).deletionRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.status !== "APPROVED") return;

    try {
      if (request.targetType === "transcript") {
        await this.prisma.transcript.delete({ where: { id: request.targetId } });
      } else if (request.targetType === "call") {
        await this.prisma.call.delete({ where: { id: request.targetId } });
      } else if (request.targetType === "story") {
        await this.prisma.story.delete({ where: { id: request.targetId } });
      } else if (request.targetType === "landing_page") {
        await this.prisma.landingPage.delete({ where: { id: request.targetId } });
      } else if (request.targetType === "account") {
        await this.prisma.account.delete({ where: { id: request.targetId } });
      }

      await (this.prisma as any).deletionRequest.update({
        where: { id: requestId },
        data: { status: "EXECUTED", executedAt: new Date() },
      });
    } catch (err) {
      await (this.prisma as any).deletionRequest.update({
        where: { id: requestId },
        data: { status: "FAILED", rejectedReason: err instanceof Error ? err.message : "Execution failed" },
      });
    }
  }

  private async retainTranscripts(
    organizationId: string,
    cutoffDate: Date,
    policy: GovernancePolicy
  ) {
    const transcripts = await this.prisma.transcript.findMany({
      where: {
        call: {
          organizationId,
          occurredAt: { lt: cutoffDate },
          ...(policy.retentionExemptAccountIds.length > 0
            ? { accountId: { notIn: policy.retentionExemptAccountIds } }
            : {}),
        },
      },
      select: { id: true, callId: true },
    });

    let deleted = 0;
    let skipped = 0;

    for (const t of transcripts) {
      const underHold = await this.isUnderLegalHold(organizationId, "transcript", t.id);
      if (underHold) {
        skipped++;
        continue;
      }

      if (policy.autoDeleteAfterRetention) {
        await this.prisma.transcript.delete({ where: { id: t.id } });
        deleted++;
      } else {
        skipped++;
      }
    }

    return { processed: transcripts.length, deleted, skipped };
  }

  private async retainCalls(
    organizationId: string,
    cutoffDate: Date,
    policy: GovernancePolicy
  ) {
    const calls = await this.prisma.call.findMany({
      where: {
        organizationId,
        occurredAt: { lt: cutoffDate },
        ...(policy.retentionExemptAccountIds.length > 0
          ? { accountId: { notIn: policy.retentionExemptAccountIds } }
          : {}),
      },
      select: { id: true },
    });

    let deleted = 0;
    let skipped = 0;

    for (const c of calls) {
      const underHold = await this.isUnderLegalHold(organizationId, "call", c.id);
      if (underHold) {
        skipped++;
        continue;
      }

      if (policy.autoDeleteAfterRetention) {
        await this.prisma.call.delete({ where: { id: c.id } });
        deleted++;
      } else {
        skipped++;
      }
    }

    return { processed: calls.length, deleted, skipped };
  }

  private async retainAuditLogs(organizationId: string, cutoffDate: Date) {
    // Audit logs older than 2x retention period can be archived
    const archiveCutoff = new Date(cutoffDate);
    archiveCutoff.setDate(archiveCutoff.getDate() - 365);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        organizationId,
        createdAt: { lt: archiveCutoff },
      },
    });

    return { processed: result.count, deleted: result.count, skipped: 0 };
  }

  private mapRetentionJob(j: any): RetentionJobRecord {
    return {
      id: j.id,
      organizationId: j.organizationId,
      status: j.status,
      targetType: j.targetType,
      totalRecords: j.totalRecords,
      processedRecords: j.processedRecords,
      deletedRecords: j.deletedRecords,
      skippedRecords: j.skippedRecords,
      errorMessage: j.errorMessage,
      startedAt: j.startedAt ?? j.createdAt,
      completedAt: j.completedAt,
    };
  }

  private mapLegalHold(h: any): LegalHoldRecord {
    return {
      id: h.id,
      organizationId: h.organizationId,
      scope: h.scope,
      targetType: h.targetType,
      targetId: h.targetId,
      reason: h.reason,
      holdStartedAt: h.holdStartedAt,
      holdEndedAt: h.holdEndedAt,
      createdById: h.createdById,
      active: h.active,
    };
  }

  private mapDeletionRequest(r: any): DeletionRequestRecord {
    return {
      id: r.id,
      organizationId: r.organizationId,
      requestedById: r.requestedById,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      approvedById: r.approvedById,
      approvedAt: r.approvedAt,
      executedAt: r.executedAt,
      rejectedReason: r.rejectedReason,
      createdAt: r.createdAt,
    };
  }
}
