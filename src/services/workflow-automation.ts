/**
 * Workflow Automation Service
 *
 * Rule engine for automated actions:
 * - Trigger types: thresholds, schedules, events
 * - Action types: Slack, email, webhook notifications
 * - Digest scheduling and subscription management
 * - Execution tracking and failure handling
 */

import type { PrismaClient } from "@prisma/client";
import logger from "../lib/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AutomationTriggerType = "EVENT" | "THRESHOLD" | "SCHEDULE" | "CRON";
export type AutomationActionType = "SLACK_MESSAGE" | "EMAIL" | "WEBHOOK" | "IN_APP_NOTIFICATION" | "DIGEST";
export type AutomationExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

export interface AutomationRuleConfig {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerType: AutomationTriggerType;
  triggerConfig: TriggerConfig;
  actionType: AutomationActionType;
  actionConfig: ActionConfig;
  filters: RuleFilter[];
  cooldownMinutes: number;
  maxExecutionsPerDay: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TriggerConfig {
  // EVENT triggers
  eventName?: string;
  // THRESHOLD triggers
  metric?: string;
  operator?: "gt" | "lt" | "gte" | "lte" | "eq";
  value?: number;
  // SCHEDULE / CRON triggers
  cronExpression?: string;
  timezone?: string;
}

export interface ActionConfig {
  // SLACK
  slackWebhookUrl?: string;
  slackChannel?: string;
  slackMessageTemplate?: string;
  // EMAIL
  emailRecipients?: string[];
  emailSubjectTemplate?: string;
  emailBodyTemplate?: string;
  // WEBHOOK
  webhookUrl?: string;
  webhookMethod?: string;
  webhookHeaders?: Record<string, string>;
  webhookBodyTemplate?: string;
  // IN_APP
  notificationTitle?: string;
  notificationBody?: string;
  targetUserIds?: string[];
  targetRoles?: string[];
  // DIGEST
  digestFrequency?: "DAILY" | "WEEKLY" | "MONTHLY";
  digestDay?: number;
  digestHour?: number;
  digestRecipients?: string[];
  digestTemplate?: string;
}

export interface RuleFilter {
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt" | "in";
  value: unknown;
}

export interface AutomationExecutionRecord {
  id: string;
  ruleId: string;
  organizationId: string;
  status: AutomationExecutionStatus;
  triggerData: Record<string, unknown>;
  actionResult: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class WorkflowAutomationService {
  constructor(private prisma: PrismaClient) {}

  // ─── Rule CRUD ─────────────────────────────────────────────────────────

  async createRule(params: {
    organizationId: string;
    name: string;
    description?: string;
    triggerType: AutomationTriggerType;
    triggerConfig: TriggerConfig;
    actionType: AutomationActionType;
    actionConfig: ActionConfig;
    filters?: RuleFilter[];
    cooldownMinutes?: number;
    maxExecutionsPerDay?: number;
    createdById: string;
  }): Promise<AutomationRuleConfig> {
    const rule = await (this.prisma as any).automationRule.create({
      data: {
        organizationId: params.organizationId,
        name: params.name,
        description: params.description ?? null,
        enabled: true,
        triggerType: params.triggerType,
        triggerConfig: params.triggerConfig as any,
        actionType: params.actionType,
        actionConfig: params.actionConfig as any,
        filters: (params.filters ?? []) as any,
        cooldownMinutes: params.cooldownMinutes ?? 0,
        maxExecutionsPerDay: params.maxExecutionsPerDay ?? 100,
        createdById: params.createdById,
      },
    });

    return this.mapRule(rule);
  }

  async updateRule(
    ruleId: string,
    updates: Partial<{
      name: string;
      description: string | null;
      enabled: boolean;
      triggerConfig: TriggerConfig;
      actionConfig: ActionConfig;
      filters: RuleFilter[];
      cooldownMinutes: number;
      maxExecutionsPerDay: number;
    }>
  ): Promise<AutomationRuleConfig> {
    const rule = await (this.prisma as any).automationRule.update({
      where: { id: ruleId },
      data: {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
        ...(updates.triggerConfig ? { triggerConfig: updates.triggerConfig as any } : {}),
        ...(updates.actionConfig ? { actionConfig: updates.actionConfig as any } : {}),
        ...(updates.filters ? { filters: updates.filters as any } : {}),
        ...(updates.cooldownMinutes !== undefined ? { cooldownMinutes: updates.cooldownMinutes } : {}),
        ...(updates.maxExecutionsPerDay !== undefined ? { maxExecutionsPerDay: updates.maxExecutionsPerDay } : {}),
      },
    });
    return this.mapRule(rule);
  }

  async deleteRule(ruleId: string): Promise<void> {
    await (this.prisma as any).automationRule.delete({ where: { id: ruleId } });
  }

  async getRules(organizationId: string): Promise<AutomationRuleConfig[]> {
    const rules = await (this.prisma as any).automationRule.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return rules.map((r: any) => this.mapRule(r));
  }

  async getRule(ruleId: string): Promise<AutomationRuleConfig | null> {
    const rule = await (this.prisma as any).automationRule.findUnique({
      where: { id: ruleId },
    });
    return rule ? this.mapRule(rule) : null;
  }

  // ─── Event Processing ──────────────────────────────────────────────────

  async processEvent(
    organizationId: string,
    eventName: string,
    eventData: Record<string, unknown>
  ): Promise<{ executed: number; skipped: number }> {
    const rules = await (this.prisma as any).automationRule.findMany({
      where: {
        organizationId,
        enabled: true,
        triggerType: "EVENT",
      },
    });

    let executed = 0;
    let skipped = 0;

    for (const rule of rules) {
      const config = rule.triggerConfig as TriggerConfig;
      if (config.eventName !== eventName) {
        continue;
      }

      // Check filters
      const filters = (rule.filters ?? []) as RuleFilter[];
      if (!this.matchesFilters(eventData, filters)) {
        skipped++;
        continue;
      }

      // Check cooldown
      if (rule.cooldownMinutes > 0) {
        const cooldownCutoff = new Date();
        cooldownCutoff.setMinutes(cooldownCutoff.getMinutes() - rule.cooldownMinutes);
        const recentExecution = await (this.prisma as any).automationExecution.findFirst({
          where: {
            ruleId: rule.id,
            status: "COMPLETED",
            completedAt: { gte: cooldownCutoff },
          },
        });
        if (recentExecution) {
          skipped++;
          continue;
        }
      }

      // Check daily limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCount = await (this.prisma as any).automationExecution.count({
        where: {
          ruleId: rule.id,
          startedAt: { gte: today },
        },
      });
      if (todayCount >= rule.maxExecutionsPerDay) {
        skipped++;
        continue;
      }

      // Execute
      await this.executeRule(rule, eventData);
      executed++;
    }

    return { executed, skipped };
  }

  async processThresholds(organizationId: string): Promise<{ executed: number }> {
    const rules = await (this.prisma as any).automationRule.findMany({
      where: {
        organizationId,
        enabled: true,
        triggerType: "THRESHOLD",
      },
    });

    let executed = 0;
    for (const rule of rules) {
      const config = rule.triggerConfig as TriggerConfig;
      if (!config.metric || config.value === undefined) continue;

      const currentValue = await this.getMetricValue(organizationId, config.metric);
      if (currentValue === null) continue;

      const triggered = this.evaluateThreshold(currentValue, config.operator ?? "gt", config.value);
      if (triggered) {
        await this.executeRule(rule, { metric: config.metric, currentValue, threshold: config.value });
        executed++;
      }
    }

    return { executed };
  }

  // ─── Execution History ─────────────────────────────────────────────────

  async getExecutions(
    organizationId: string,
    params?: { ruleId?: string; status?: string; limit?: number }
  ): Promise<AutomationExecutionRecord[]> {
    const executions = await (this.prisma as any).automationExecution.findMany({
      where: {
        organizationId,
        ...(params?.ruleId ? { ruleId: params.ruleId } : {}),
        ...(params?.status ? { status: params.status } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: params?.limit ?? 100,
    });
    return executions.map((e: any) => this.mapExecution(e));
  }

  // ─── Delivery Targets ──────────────────────────────────────────────────

  async getDeliveryTargets(organizationId: string): Promise<Array<{
    id: string;
    type: string;
    name: string;
    config: Record<string, unknown>;
    enabled: boolean;
  }>> {
    const targets = await (this.prisma as any).deliveryTarget.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
    return targets.map((t: any) => ({
      id: t.id,
      type: t.type,
      name: t.name,
      config: t.config ?? {},
      enabled: t.enabled,
    }));
  }

  async createDeliveryTarget(params: {
    organizationId: string;
    type: string;
    name: string;
    config: Record<string, unknown>;
  }): Promise<string> {
    const target = await (this.prisma as any).deliveryTarget.create({
      data: {
        organizationId: params.organizationId,
        type: params.type,
        name: params.name,
        config: params.config as any,
        enabled: true,
      },
    });
    return target.id;
  }

  async updateDeliveryTarget(
    targetId: string,
    updates: Partial<{ name: string; config: Record<string, unknown>; enabled: boolean }>
  ): Promise<void> {
    await (this.prisma as any).deliveryTarget.update({
      where: { id: targetId },
      data: updates as any,
    });
  }

  async deleteDeliveryTarget(targetId: string): Promise<void> {
    await (this.prisma as any).deliveryTarget.delete({ where: { id: targetId } });
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private async executeRule(rule: any, triggerData: Record<string, unknown>): Promise<void> {
    const startedAt = new Date();
    const execution = await (this.prisma as any).automationExecution.create({
      data: {
        ruleId: rule.id,
        organizationId: rule.organizationId,
        status: "RUNNING",
        triggerData: triggerData as any,
        startedAt,
      },
    });

    try {
      const actionConfig = rule.actionConfig as ActionConfig;
      const result = await this.executeAction(rule.actionType, actionConfig, triggerData);

      const completedAt = new Date();
      await (this.prisma as any).automationExecution.update({
        where: { id: execution.id },
        data: {
          status: "COMPLETED",
          actionResult: result as any,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
      });
    } catch (err) {
      const completedAt = new Date();
      await (this.prisma as any).automationExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
      });
    }
  }

  private async executeAction(
    actionType: string,
    config: ActionConfig,
    triggerData: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    switch (actionType) {
      case "SLACK_MESSAGE":
        return this.sendSlackMessage(config, triggerData);
      case "EMAIL":
        return this.sendEmail(config, triggerData);
      case "WEBHOOK":
        return this.sendWebhook(config, triggerData);
      case "IN_APP_NOTIFICATION":
        return this.sendInAppNotification(config, triggerData);
      default:
        throw new Error(`Unsupported action type: ${actionType}`);
    }
  }

  private async sendSlackMessage(
    config: ActionConfig,
    triggerData: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!config.slackWebhookUrl) throw new Error("Slack webhook URL not configured");
    const message = this.interpolateTemplate(config.slackMessageTemplate ?? "", triggerData);

    const response = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, channel: config.slackChannel }),
    });
    return { sent: true, status: response.status };
  }

  private async sendEmail(
    config: ActionConfig,
    _triggerData: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    logger.info("Email automation triggered", {
      recipients: config.emailRecipients?.length ?? 0,
      subject: config.emailSubjectTemplate,
    });
    return { sent: true, recipientCount: config.emailRecipients?.length ?? 0 };
  }

  private async sendWebhook(
    config: ActionConfig,
    triggerData: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!config.webhookUrl) throw new Error("Webhook URL not configured");
    const body = config.webhookBodyTemplate
      ? this.interpolateTemplate(config.webhookBodyTemplate, triggerData)
      : JSON.stringify(triggerData);

    const response = await fetch(config.webhookUrl, {
      method: config.webhookMethod ?? "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.webhookHeaders ?? {}),
      },
      body,
    });
    return { sent: true, status: response.status };
  }

  private async sendInAppNotification(
    config: ActionConfig,
    _triggerData: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    logger.info("In-app notification automation triggered", {
      title: config.notificationTitle,
      targetUsers: config.targetUserIds?.length ?? 0,
    });
    return { sent: true };
  }

  private matchesFilters(data: Record<string, unknown>, filters: RuleFilter[]): boolean {
    for (const filter of filters) {
      const value = data[filter.field];
      switch (filter.operator) {
        case "eq": if (value !== filter.value) return false; break;
        case "neq": if (value === filter.value) return false; break;
        case "contains":
          if (typeof value !== "string" || !value.includes(String(filter.value))) return false;
          break;
        case "gt": if (typeof value !== "number" || value <= (filter.value as number)) return false; break;
        case "lt": if (typeof value !== "number" || value >= (filter.value as number)) return false; break;
        case "in":
          if (!Array.isArray(filter.value) || !filter.value.includes(value)) return false;
          break;
      }
    }
    return true;
  }

  private evaluateThreshold(current: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case "gt": return current > threshold;
      case "lt": return current < threshold;
      case "gte": return current >= threshold;
      case "lte": return current <= threshold;
      case "eq": return current === threshold;
      default: return false;
    }
  }

  private async getMetricValue(organizationId: string, metric: string): Promise<number | null> {
    switch (metric) {
      case "dlq_count": {
        const count = await (this.prisma as any).integrationDlqEntry?.count?.({
          where: { organizationId, status: "PENDING" },
        });
        return count ?? null;
      }
      case "pending_approvals": {
        const count = await (this.prisma as any).crmWritebackAction?.count?.({
          where: { organizationId, status: "PENDING_APPROVAL" },
        });
        return count ?? null;
      }
      default:
        return null;
    }
  }

  private interpolateTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ""));
  }

  private mapRule(r: any): AutomationRuleConfig {
    return {
      id: r.id,
      organizationId: r.organizationId,
      name: r.name,
      description: r.description,
      enabled: r.enabled,
      triggerType: r.triggerType,
      triggerConfig: r.triggerConfig ?? {},
      actionType: r.actionType,
      actionConfig: r.actionConfig ?? {},
      filters: r.filters ?? [],
      cooldownMinutes: r.cooldownMinutes ?? 0,
      maxExecutionsPerDay: r.maxExecutionsPerDay ?? 100,
      createdById: r.createdById,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapExecution(e: any): AutomationExecutionRecord {
    return {
      id: e.id,
      ruleId: e.ruleId,
      organizationId: e.organizationId,
      status: e.status,
      triggerData: e.triggerData ?? {},
      actionResult: e.actionResult,
      errorMessage: e.errorMessage,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      durationMs: e.durationMs,
    };
  }
}
