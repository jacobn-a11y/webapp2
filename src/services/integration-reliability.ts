/**
 * Integration Reliability Service
 *
 * Provides production-grade integration reliability:
 * - Integration run ledger with idempotency keys
 * - Retry policies with jitter/backoff per connector
 * - Dead-letter queue management + replay
 * - Dedupe rules for inbound records
 * - Backfill jobs with progress tracking
 * - Integration health dashboard data
 */

import type { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import logger from "../lib/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type IntegrationRunStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "RETRYING"
  | "CANCELLED";

export type DlqEntryStatus = "PENDING" | "RETRIED" | "DISCARDED" | "RESOLVED";

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export interface IntegrationRunRecord {
  id: string;
  organizationId: string;
  provider: string;
  runType: string;
  idempotencyKey: string;
  status: IntegrationRunStatus;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  retryCount: number;
  metadata: Record<string, unknown>;
}

export interface DlqEntry {
  id: string;
  organizationId: string;
  provider: string;
  recordType: string;
  externalId: string;
  payload: Record<string, unknown>;
  errorMessage: string;
  status: DlqEntryStatus;
  retryCount: number;
  lastRetriedAt: Date | null;
  createdAt: Date;
}

export interface IntegrationHealthSummary {
  provider: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  lastSuccessfulRun: Date | null;
  lastFailedRun: Date | null;
  totalRuns24h: number;
  failedRuns24h: number;
  avgDurationMs: number;
  dlqCount: number;
  recordsProcessed24h: number;
  lastSyncLagMinutes: number | null;
}

// ─── Default Retry Policies ──────────────────────────────────────────────────

const DEFAULT_RETRY_POLICIES: Record<string, RetryPolicy> = {
  GONG: { maxRetries: 5, baseDelayMs: 2000, maxDelayMs: 120000, backoffMultiplier: 2, jitterFactor: 0.25 },
  GRAIN: { maxRetries: 5, baseDelayMs: 2000, maxDelayMs: 120000, backoffMultiplier: 2, jitterFactor: 0.25 },
  SALESFORCE: { maxRetries: 3, baseDelayMs: 5000, maxDelayMs: 300000, backoffMultiplier: 3, jitterFactor: 0.3 },
  MERGE_DEV: { maxRetries: 4, baseDelayMs: 3000, maxDelayMs: 180000, backoffMultiplier: 2, jitterFactor: 0.2 },
  DEFAULT: { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 60000, backoffMultiplier: 2, jitterFactor: 0.25 },
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class IntegrationReliabilityService {
  constructor(private prisma: PrismaClient) {}

  // ─── Run Ledger ────────────────────────────────────────────────────────

  async startRun(params: {
    organizationId: string;
    provider: string;
    runType: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IntegrationRunRecord> {
    const idempotencyKey = params.idempotencyKey ??
      `${params.provider}:${params.runType}:${params.organizationId}:${Date.now()}`;

    // Check for duplicate run (idempotency)
    const existing = await (this.prisma as any).integrationRun.findFirst({
      where: {
        organizationId: params.organizationId,
        idempotencyKey,
        status: { in: ["PENDING", "RUNNING"] },
      },
    });

    if (existing) {
      logger.warn("Duplicate integration run detected", {
        idempotencyKey,
        existingRunId: existing.id,
      });
      return this.mapRunRecord(existing);
    }

    const run = await (this.prisma as any).integrationRun.create({
      data: {
        organizationId: params.organizationId,
        provider: params.provider,
        runType: params.runType,
        idempotencyKey,
        status: "RUNNING",
        recordsProcessed: 0,
        recordsFailed: 0,
        retryCount: 0,
        startedAt: new Date(),
        metadata: params.metadata ?? {},
      },
    });

    logger.info("Integration run started", {
      runId: run.id,
      provider: params.provider,
      runType: params.runType,
    });

    return this.mapRunRecord(run);
  }

  async completeRun(
    runId: string,
    result: { recordsProcessed: number; recordsFailed: number; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await (this.prisma as any).integrationRun.update({
      where: { id: runId },
      data: {
        status: result.recordsFailed > 0 && result.recordsProcessed === 0 ? "FAILED" : "COMPLETED",
        recordsProcessed: result.recordsProcessed,
        recordsFailed: result.recordsFailed,
        completedAt: new Date(),
        metadata: result.metadata,
      },
    });
  }

  async failRun(runId: string, errorMessage: string): Promise<void> {
    const run = await (this.prisma as any).integrationRun.findUnique({ where: { id: runId } });
    if (!run) return;

    const policy = this.getRetryPolicy(run.provider);

    if (run.retryCount < policy.maxRetries) {
      const delay = this.calculateRetryDelay(run.retryCount, policy);
      await (this.prisma as any).integrationRun.update({
        where: { id: runId },
        data: {
          status: "RETRYING",
          retryCount: run.retryCount + 1,
          errorMessage,
          nextRetryAt: new Date(Date.now() + delay),
        },
      });
      logger.info("Integration run scheduled for retry", {
        runId,
        retryCount: run.retryCount + 1,
        delayMs: delay,
      });
    } else {
      await (this.prisma as any).integrationRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          errorMessage,
          completedAt: new Date(),
        },
      });
      logger.error("Integration run failed permanently", {
        runId,
        provider: run.provider,
        retries: run.retryCount,
      });
    }
  }

  async getRunHistory(
    organizationId: string,
    params?: { provider?: string; status?: string; limit?: number }
  ): Promise<IntegrationRunRecord[]> {
    const runs = await (this.prisma as any).integrationRun.findMany({
      where: {
        organizationId,
        ...(params?.provider ? { provider: params.provider } : {}),
        ...(params?.status ? { status: params.status } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: params?.limit ?? 50,
    });

    return runs.map((r: any) => this.mapRunRecord(r));
  }

  // ─── Dead Letter Queue ─────────────────────────────────────────────────

  async addToDlq(params: {
    organizationId: string;
    provider: string;
    recordType: string;
    externalId: string;
    payload: Record<string, unknown>;
    errorMessage: string;
    integrationRunId?: string;
  }): Promise<string> {
    // Dedupe check
    const existing = await (this.prisma as any).integrationDlqEntry.findFirst({
      where: {
        organizationId: params.organizationId,
        provider: params.provider,
        externalId: params.externalId,
        status: "PENDING",
      },
    });

    if (existing) {
      await (this.prisma as any).integrationDlqEntry.update({
        where: { id: existing.id },
        data: {
          errorMessage: params.errorMessage,
          retryCount: existing.retryCount + 1,
          payload: params.payload,
        },
      });
      return existing.id;
    }

    const entry = await (this.prisma as any).integrationDlqEntry.create({
      data: {
        organizationId: params.organizationId,
        provider: params.provider,
        recordType: params.recordType,
        externalId: params.externalId,
        payload: params.payload,
        errorMessage: params.errorMessage,
        status: "PENDING",
        retryCount: 0,
        integrationRunId: params.integrationRunId ?? null,
      },
    });

    return entry.id;
  }

  async getDlqEntries(
    organizationId: string,
    params?: { provider?: string; status?: string; limit?: number }
  ): Promise<DlqEntry[]> {
    const entries = await (this.prisma as any).integrationDlqEntry.findMany({
      where: {
        organizationId,
        ...(params?.provider ? { provider: params.provider } : {}),
        ...(params?.status ? { status: params.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: params?.limit ?? 100,
    });

    return entries.map((e: any) => ({
      id: e.id,
      organizationId: e.organizationId,
      provider: e.provider,
      recordType: e.recordType,
      externalId: e.externalId,
      payload: e.payload,
      errorMessage: e.errorMessage,
      status: e.status,
      retryCount: e.retryCount,
      lastRetriedAt: e.lastRetriedAt,
      createdAt: e.createdAt,
    }));
  }

  async replayDlqEntry(entryId: string): Promise<{ success: boolean; error?: string }> {
    const entry = await (this.prisma as any).integrationDlqEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry || entry.status !== "PENDING") {
      return { success: false, error: "Entry not found or not in PENDING state" };
    }

    await (this.prisma as any).integrationDlqEntry.update({
      where: { id: entryId },
      data: {
        status: "RETRIED",
        retryCount: entry.retryCount + 1,
        lastRetriedAt: new Date(),
      },
    });

    return { success: true };
  }

  async replayAllDlq(
    organizationId: string,
    provider?: string
  ): Promise<{ replayed: number }> {
    const result = await (this.prisma as any).integrationDlqEntry.updateMany({
      where: {
        organizationId,
        status: "PENDING",
        ...(provider ? { provider } : {}),
      },
      data: {
        status: "RETRIED",
        lastRetriedAt: new Date(),
      },
    });

    return { replayed: result.count };
  }

  async discardDlqEntry(entryId: string): Promise<void> {
    await (this.prisma as any).integrationDlqEntry.update({
      where: { id: entryId },
      data: { status: "DISCARDED" },
    });
  }

  // ─── Health Dashboard ──────────────────────────────────────────────────

  async getHealthSummary(organizationId: string): Promise<IntegrationHealthSummary[]> {
    const providers = ["GONG", "GRAIN", "SALESFORCE", "MERGE_DEV"];
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const summaries: IntegrationHealthSummary[] = [];

    for (const provider of providers) {
      const [runs, dlqCount, lastSuccess, lastFailure] = await Promise.all([
        (this.prisma as any).integrationRun.findMany({
          where: {
            organizationId,
            provider,
            startedAt: { gte: twentyFourHoursAgo },
          },
          select: {
            status: true,
            recordsProcessed: true,
            startedAt: true,
            completedAt: true,
          },
        }),
        (this.prisma as any).integrationDlqEntry.count({
          where: { organizationId, provider, status: "PENDING" },
        }),
        (this.prisma as any).integrationRun.findFirst({
          where: { organizationId, provider, status: "COMPLETED" },
          orderBy: { completedAt: "desc" },
          select: { completedAt: true },
        }),
        (this.prisma as any).integrationRun.findFirst({
          where: { organizationId, provider, status: "FAILED" },
          orderBy: { completedAt: "desc" },
          select: { completedAt: true },
        }),
      ]);

      const totalRuns = runs.length;
      const failedRuns = runs.filter((r: any) => r.status === "FAILED").length;
      const completedRuns = runs.filter((r: any) => r.completedAt);
      const avgDuration = completedRuns.length > 0
        ? completedRuns.reduce((sum: number, r: any) =>
            sum + (new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()), 0
          ) / completedRuns.length
        : 0;
      const recordsProcessed = runs.reduce((sum: number, r: any) => sum + r.recordsProcessed, 0);

      const lastSyncLag = lastSuccess?.completedAt
        ? Math.round((now.getTime() - new Date(lastSuccess.completedAt).getTime()) / 60000)
        : null;

      let status: IntegrationHealthSummary["status"] = "unknown";
      if (totalRuns > 0) {
        const failRate = failedRuns / totalRuns;
        if (failRate === 0) status = "healthy";
        else if (failRate < 0.3) status = "degraded";
        else status = "down";
      }

      summaries.push({
        provider,
        status,
        lastSuccessfulRun: lastSuccess?.completedAt ?? null,
        lastFailedRun: lastFailure?.completedAt ?? null,
        totalRuns24h: totalRuns,
        failedRuns24h: failedRuns,
        avgDurationMs: Math.round(avgDuration),
        dlqCount,
        recordsProcessed24h: recordsProcessed,
        lastSyncLagMinutes: lastSyncLag,
      });
    }

    return summaries;
  }

  // ─── Backfill Support ──────────────────────────────────────────────────

  async startBackfill(params: {
    organizationId: string;
    provider: string;
    startDate?: Date;
    endDate?: Date;
    cursor?: string;
  }): Promise<IntegrationRunRecord> {
    return this.startRun({
      organizationId: params.organizationId,
      provider: params.provider,
      runType: "BACKFILL",
      idempotencyKey: `backfill:${params.provider}:${params.organizationId}:${Date.now()}`,
      metadata: {
        startDate: params.startDate?.toISOString(),
        endDate: params.endDate?.toISOString(),
        cursor: params.cursor,
      },
    });
  }

  // ─── Dedupe ────────────────────────────────────────────────────────────

  async checkDedupe(
    organizationId: string,
    provider: string,
    externalId: string
  ): Promise<boolean> {
    const existing = await (this.prisma as any).integrationRun.findFirst({
      where: {
        organizationId,
        provider,
        status: "COMPLETED",
        metadata: { path: ["processedIds"], array_contains: [externalId] },
      },
    });
    return !!existing;
  }

  generateIdempotencyKey(
    provider: string,
    recordType: string,
    externalId: string,
    timestamp?: Date
  ): string {
    const ts = timestamp?.toISOString() ?? new Date().toISOString().slice(0, 10);
    return crypto
      .createHash("sha256")
      .update(`${provider}:${recordType}:${externalId}:${ts}`)
      .digest("hex")
      .slice(0, 32);
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private getRetryPolicy(provider: string): RetryPolicy {
    return DEFAULT_RETRY_POLICIES[provider] ?? DEFAULT_RETRY_POLICIES.DEFAULT;
  }

  private calculateRetryDelay(retryCount: number, policy: RetryPolicy): number {
    const exponentialDelay = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, retryCount);
    const clampedDelay = Math.min(exponentialDelay, policy.maxDelayMs);
    const jitter = clampedDelay * policy.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(clampedDelay + jitter));
  }

  private mapRunRecord(r: any): IntegrationRunRecord {
    return {
      id: r.id,
      organizationId: r.organizationId,
      provider: r.provider,
      runType: r.runType,
      idempotencyKey: r.idempotencyKey,
      status: r.status,
      recordsProcessed: r.recordsProcessed,
      recordsFailed: r.recordsFailed,
      errorMessage: r.errorMessage,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      retryCount: r.retryCount,
      metadata: r.metadata ?? {},
    };
  }
}
