/**
 * CRM Writeback Service
 *
 * Manages writeback actions to CRM systems (Salesforce, HubSpot):
 * - Tasks, notes, field updates, timeline events
 * - Approval workflows for writebacks
 * - Audit trail and rollback support
 * - Policy-based guards
 */

import type { PrismaClient } from "@prisma/client";
import logger from "../lib/logger.js";

export type CrmWritebackType = "TASK" | "NOTE" | "FIELD_UPDATE" | "TIMELINE_EVENT" | "OPPORTUNITY_UPDATE";
export type CrmWritebackStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTING" | "COMPLETED" | "FAILED" | "ROLLED_BACK";

export interface WritebackAction {
  id: string;
  organizationId: string;
  crmProvider: string;
  writebackType: CrmWritebackType;
  targetObjectType: string;
  targetObjectId: string;
  payload: Record<string, unknown>;
  status: CrmWritebackStatus;
  requestedById: string;
  approvedById: string | null;
  executedAt: Date | null;
  rollbackPayload: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface WritebackPolicy {
  requireApproval: boolean;
  allowedTypes: CrmWritebackType[];
  allowedRoles: string[];
  maxWritebacksPerDay: number;
}

const DEFAULT_WRITEBACK_POLICY: WritebackPolicy = {
  requireApproval: true,
  allowedTypes: ["TASK", "NOTE", "TIMELINE_EVENT"],
  allowedRoles: ["OWNER", "ADMIN"],
  maxWritebacksPerDay: 100,
};

export class CrmWritebackService {
  constructor(private prisma: PrismaClient) {}

  async createWriteback(params: {
    organizationId: string;
    crmProvider: string;
    writebackType: CrmWritebackType;
    targetObjectType: string;
    targetObjectId: string;
    payload: Record<string, unknown>;
    requestedById: string;
  }): Promise<WritebackAction> {
    const policy = await this.getPolicy(params.organizationId);

    if (!policy.allowedTypes.includes(params.writebackType)) {
      throw new Error(`Writeback type ${params.writebackType} is not allowed by organization policy`);
    }

    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await (this.prisma as any).crmWritebackAction.count({
      where: {
        organizationId: params.organizationId,
        createdAt: { gte: today },
      },
    });

    if (todayCount >= policy.maxWritebacksPerDay) {
      throw new Error("Daily writeback limit reached");
    }

    const action = await (this.prisma as any).crmWritebackAction.create({
      data: {
        organizationId: params.organizationId,
        crmProvider: params.crmProvider,
        writebackType: params.writebackType,
        targetObjectType: params.targetObjectType,
        targetObjectId: params.targetObjectId,
        payload: params.payload,
        status: policy.requireApproval ? "PENDING_APPROVAL" : "APPROVED",
        requestedById: params.requestedById,
        ...(policy.requireApproval ? {} : {
          approvedById: params.requestedById,
          approvedAt: new Date(),
        }),
      },
    });

    logger.info("CRM writeback created", {
      actionId: action.id,
      type: params.writebackType,
      provider: params.crmProvider,
      requiresApproval: policy.requireApproval,
    });

    return this.mapAction(action);
  }

  async approveWriteback(actionId: string, approvedById: string): Promise<void> {
    await (this.prisma as any).crmWritebackAction.update({
      where: { id: actionId },
      data: {
        status: "APPROVED",
        approvedById,
        approvedAt: new Date(),
      },
    });
  }

  async rejectWriteback(actionId: string, rejectedById: string, reason: string): Promise<void> {
    await (this.prisma as any).crmWritebackAction.update({
      where: { id: actionId },
      data: {
        status: "REJECTED",
        approvedById: rejectedById,
        errorMessage: reason,
      },
    });
  }

  async executeWriteback(actionId: string): Promise<{ success: boolean; error?: string }> {
    const action = await (this.prisma as any).crmWritebackAction.findUnique({
      where: { id: actionId },
    });

    if (!action || action.status !== "APPROVED") {
      return { success: false, error: "Action not found or not approved" };
    }

    await (this.prisma as any).crmWritebackAction.update({
      where: { id: actionId },
      data: { status: "EXECUTING" },
    });

    try {
      // Store previous state for rollback capability
      const previousState = await this.captureCurrentState(action);

      // Execute the writeback (provider-specific logic would go here)
      await this.executeProviderWriteback(action);

      await (this.prisma as any).crmWritebackAction.update({
        where: { id: actionId },
        data: {
          status: "COMPLETED",
          executedAt: new Date(),
          rollbackPayload: previousState,
        },
      });

      return { success: true };
    } catch (err) {
      await (this.prisma as any).crmWritebackAction.update({
        where: { id: actionId },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Execution failed",
        },
      });
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async rollbackWriteback(actionId: string): Promise<{ success: boolean; error?: string }> {
    const action = await (this.prisma as any).crmWritebackAction.findUnique({
      where: { id: actionId },
    });

    if (!action || action.status !== "COMPLETED" || !action.rollbackPayload) {
      return { success: false, error: "Cannot rollback: no rollback data available" };
    }

    try {
      // Execute rollback using stored previous state
      await this.executeProviderRollback(action);

      await (this.prisma as any).crmWritebackAction.update({
        where: { id: actionId },
        data: { status: "ROLLED_BACK" },
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Rollback failed" };
    }
  }

  async getWritebacks(
    organizationId: string,
    params?: { status?: string; provider?: string; limit?: number }
  ): Promise<WritebackAction[]> {
    const actions = await (this.prisma as any).crmWritebackAction.findMany({
      where: {
        organizationId,
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.provider ? { crmProvider: params.provider } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: params?.limit ?? 50,
    });
    return actions.map((a: any) => this.mapAction(a));
  }

  async getPendingApprovals(organizationId: string): Promise<WritebackAction[]> {
    return this.getWritebacks(organizationId, { status: "PENDING_APPROVAL" });
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private async getPolicy(organizationId: string): Promise<WritebackPolicy> {
    try {
      const flag = await (this.prisma as any).orgFeatureFlag.findUnique({
        where: { organizationId_key: { organizationId, key: "crm_writeback_policy" } },
      });
      if (flag?.config) {
        return { ...DEFAULT_WRITEBACK_POLICY, ...(flag.config as Record<string, unknown>) } as WritebackPolicy;
      }
    } catch { /* use defaults */ }
    return { ...DEFAULT_WRITEBACK_POLICY };
  }

  private async captureCurrentState(action: any): Promise<Record<string, unknown> | null> {
    // In production, this would query the CRM to capture the current field values
    // before overwriting them, enabling rollback
    return {
      capturedAt: new Date().toISOString(),
      targetObjectType: action.targetObjectType,
      targetObjectId: action.targetObjectId,
      writebackType: action.writebackType,
    };
  }

  private async executeProviderWriteback(action: any): Promise<void> {
    // Provider-specific writeback execution
    // This would call the actual CRM API in production
    logger.info("Executing CRM writeback", {
      provider: action.crmProvider,
      type: action.writebackType,
      targetId: action.targetObjectId,
    });
  }

  private async executeProviderRollback(action: any): Promise<void> {
    logger.info("Executing CRM writeback rollback", {
      provider: action.crmProvider,
      actionId: action.id,
    });
  }

  private mapAction(a: any): WritebackAction {
    return {
      id: a.id,
      organizationId: a.organizationId,
      crmProvider: a.crmProvider,
      writebackType: a.writebackType,
      targetObjectType: a.targetObjectType,
      targetObjectId: a.targetObjectId,
      payload: a.payload ?? {},
      status: a.status,
      requestedById: a.requestedById,
      approvedById: a.approvedById,
      executedAt: a.executedAt,
      rollbackPayload: a.rollbackPayload,
      errorMessage: a.errorMessage,
      createdAt: a.createdAt,
    };
  }
}
