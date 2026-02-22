/**
 * Workflow Automation API Routes
 *
 * Endpoints for managing automation rules, execution history,
 * and delivery targets.
 *
 * Routes:
 *   GET    /rules                     - List automation rules
 *   POST   /rules                     - Create automation rule (admin only)
 *   PATCH  /rules/:ruleId             - Update automation rule (admin only)
 *   DELETE /rules/:ruleId             - Delete automation rule (admin only)
 *   GET    /executions                - List execution history
 *   GET    /delivery-targets          - List delivery targets
 *   POST   /delivery-targets          - Create delivery target (admin only)
 *   PATCH  /delivery-targets/:targetId - Update delivery target (admin only)
 *   DELETE /delivery-targets/:targetId - Delete delivery target (admin only)
 *   POST   /test-delivery             - Test a delivery target (admin only)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { WorkflowAutomationService, type RuleFilter } from "../services/workflow-automation.js";

// ─── Validation Schemas ─────────────────────────────────────────────────────

const TriggerConfigSchema = z.object({
  eventName: z.string().optional(),
  metric: z.string().optional(),
  operator: z.enum(["gt", "lt", "gte", "lte", "eq"]).optional(),
  value: z.number().optional(),
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
});

const ActionConfigSchema = z.object({
  slackWebhookUrl: z.string().optional(),
  slackChannel: z.string().optional(),
  slackMessageTemplate: z.string().optional(),
  emailRecipients: z.array(z.string()).optional(),
  emailSubjectTemplate: z.string().optional(),
  emailBodyTemplate: z.string().optional(),
  webhookUrl: z.string().optional(),
  webhookMethod: z.string().optional(),
  webhookHeaders: z.record(z.string()).optional(),
  webhookBodyTemplate: z.string().optional(),
  notificationTitle: z.string().optional(),
  notificationBody: z.string().optional(),
  targetUserIds: z.array(z.string()).optional(),
  targetRoles: z.array(z.string()).optional(),
  digestFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional(),
  digestDay: z.number().optional(),
  digestHour: z.number().optional(),
  digestRecipients: z.array(z.string()).optional(),
  digestTemplate: z.string().optional(),
});

const RuleFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "neq", "contains", "gt", "lt", "in"]),
  value: z.unknown(),
});

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  triggerType: z.enum(["EVENT", "THRESHOLD", "SCHEDULE", "CRON"]),
  triggerConfig: TriggerConfigSchema,
  actionType: z.enum(["SLACK_MESSAGE", "EMAIL", "WEBHOOK", "IN_APP_NOTIFICATION", "DIGEST"]),
  actionConfig: ActionConfigSchema,
  filters: z.array(RuleFilterSchema).optional(),
  cooldownMinutes: z.number().int().min(0).optional(),
  maxExecutionsPerDay: z.number().int().min(1).optional(),
});

const UpdateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
  triggerConfig: TriggerConfigSchema.optional(),
  actionConfig: ActionConfigSchema.optional(),
  filters: z.array(RuleFilterSchema).optional(),
  cooldownMinutes: z.number().int().min(0).optional(),
  maxExecutionsPerDay: z.number().int().min(1).optional(),
});

const ExecutionsQuerySchema = z.object({
  ruleId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const CreateDeliveryTargetSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1).max(200),
  config: z.record(z.unknown()),
});

const UpdateDeliveryTargetSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const TestDeliverySchema = z.object({
  targetId: z.string().min(1),
  testPayload: z.record(z.unknown()),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function isAdmin(req: Request): boolean {
  const userRole = (req as any).userRole;
  return !!userRole && ["OWNER", "ADMIN"].includes(userRole);
}

// ─── Route Factory ──────────────────────────────────────────────────────────

export function createAutomationRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new WorkflowAutomationService(prisma);

  // ── GET /rules ──────────────────────────────────────────────────────

  /**
   * GET /rules
   *
   * Lists all automation rules for the organization.
   */
  router.get("/rules", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const rules = await service.getRules(organizationId);
      res.json({ rules });
    } catch (err) {
      console.error("List automation rules error:", err);
      res.status(500).json({ error: "Failed to list automation rules" });
    }
  });

  // ── POST /rules ─────────────────────────────────────────────────────

  /**
   * POST /rules
   *
   * Creates a new automation rule. Admin only.
   */
  router.post("/rules", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = CreateRuleSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const rule = await service.createRule({
        organizationId,
        createdById: userId,
        name: parse.data.name,
        description: parse.data.description,
        triggerType: parse.data.triggerType,
        triggerConfig: parse.data.triggerConfig,
        actionType: parse.data.actionType,
        actionConfig: parse.data.actionConfig,
        filters: parse.data.filters as RuleFilter[] | undefined,
        cooldownMinutes: parse.data.cooldownMinutes,
        maxExecutionsPerDay: parse.data.maxExecutionsPerDay,
      });

      res.status(201).json({ rule });
    } catch (err) {
      console.error("Create automation rule error:", err);
      res.status(500).json({ error: "Failed to create automation rule" });
    }
  });

  // ── PATCH /rules/:ruleId ────────────────────────────────────────────

  /**
   * PATCH /rules/:ruleId
   *
   * Updates an existing automation rule. Admin only.
   */
  router.patch("/rules/:ruleId", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = UpdateRuleSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    const ruleId = req.params.ruleId as string;

    try {
      // Verify rule belongs to this organization
      const existing = await service.getRule(ruleId);
      if (!existing || existing.organizationId !== organizationId) {
        res.status(404).json({ error: "Automation rule not found" });
        return;
      }

      const rule = await service.updateRule(ruleId, {
        ...parse.data,
        filters: parse.data.filters as RuleFilter[] | undefined,
      });
      res.json({ rule });
    } catch (err) {
      console.error("Update automation rule error:", err);
      res.status(500).json({ error: "Failed to update automation rule" });
    }
  });

  // ── DELETE /rules/:ruleId ───────────────────────────────────────────

  /**
   * DELETE /rules/:ruleId
   *
   * Deletes an automation rule. Admin only.
   */
  router.delete("/rules/:ruleId", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const ruleId = req.params.ruleId as string;

    try {
      // Verify rule belongs to this organization
      const existing = await service.getRule(ruleId);
      if (!existing || existing.organizationId !== organizationId) {
        res.status(404).json({ error: "Automation rule not found" });
        return;
      }

      await service.deleteRule(ruleId);
      res.json({ deleted: true });
    } catch (err) {
      console.error("Delete automation rule error:", err);
      res.status(500).json({ error: "Failed to delete automation rule" });
    }
  });

  // ── GET /executions ─────────────────────────────────────────────────

  /**
   * GET /executions
   *
   * Lists execution history for the organization.
   * Query params: ruleId, status, limit, offset
   */
  router.get("/executions", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = ExecutionsQuerySchema.safeParse(req.query);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    const { ruleId, status, limit, offset } = parse.data;

    try {
      const executions = await service.getExecutions(organizationId, {
        ruleId,
        status,
        limit: limit ?? 100,
      });

      // Apply offset at the route level since the service does not support it natively
      const sliced = offset ? executions.slice(offset) : executions;

      res.json({ executions: sliced });
    } catch (err) {
      console.error("List automation executions error:", err);
      res.status(500).json({ error: "Failed to list execution history" });
    }
  });

  // ── GET /delivery-targets ───────────────────────────────────────────

  /**
   * GET /delivery-targets
   *
   * Lists all delivery targets for the organization.
   */
  router.get("/delivery-targets", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const targets = await service.getDeliveryTargets(organizationId);
      res.json({ targets });
    } catch (err) {
      console.error("List delivery targets error:", err);
      res.status(500).json({ error: "Failed to list delivery targets" });
    }
  });

  // ── POST /delivery-targets ──────────────────────────────────────────

  /**
   * POST /delivery-targets
   *
   * Creates a new delivery target. Admin only.
   */
  router.post("/delivery-targets", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = CreateDeliveryTargetSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const targetId = await service.createDeliveryTarget({
        organizationId,
        type: parse.data.type,
        name: parse.data.name,
        config: parse.data.config,
      });

      res.status(201).json({ id: targetId });
    } catch (err) {
      console.error("Create delivery target error:", err);
      res.status(500).json({ error: "Failed to create delivery target" });
    }
  });

  // ── PATCH /delivery-targets/:targetId ───────────────────────────────

  /**
   * PATCH /delivery-targets/:targetId
   *
   * Updates an existing delivery target. Admin only.
   */
  router.patch("/delivery-targets/:targetId", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = UpdateDeliveryTargetSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    const targetId = req.params.targetId as string;

    try {
      // Verify target belongs to this organization
      const targets = await service.getDeliveryTargets(organizationId);
      const existing = targets.find((t) => t.id === targetId);
      if (!existing) {
        res.status(404).json({ error: "Delivery target not found" });
        return;
      }

      await service.updateDeliveryTarget(targetId, parse.data);
      res.json({ updated: true });
    } catch (err) {
      console.error("Update delivery target error:", err);
      res.status(500).json({ error: "Failed to update delivery target" });
    }
  });

  // ── DELETE /delivery-targets/:targetId ──────────────────────────────

  /**
   * DELETE /delivery-targets/:targetId
   *
   * Deletes a delivery target. Admin only.
   */
  router.delete("/delivery-targets/:targetId", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const targetId = req.params.targetId as string;

    try {
      // Verify target belongs to this organization
      const targets = await service.getDeliveryTargets(organizationId);
      const existing = targets.find((t) => t.id === targetId);
      if (!existing) {
        res.status(404).json({ error: "Delivery target not found" });
        return;
      }

      await service.deleteDeliveryTarget(targetId);
      res.json({ deleted: true });
    } catch (err) {
      console.error("Delete delivery target error:", err);
      res.status(500).json({ error: "Failed to delete delivery target" });
    }
  });

  // ── POST /test-delivery ─────────────────────────────────────────────

  /**
   * POST /test-delivery
   *
   * Tests a delivery target by sending a test payload. Admin only.
   * Body: { targetId, testPayload }
   */
  router.post("/test-delivery", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = TestDeliverySchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    const { targetId, testPayload } = parse.data;

    try {
      // Verify target belongs to this organization
      const targets = await service.getDeliveryTargets(organizationId);
      const target = targets.find((t) => t.id === targetId);
      if (!target) {
        res.status(404).json({ error: "Delivery target not found" });
        return;
      }

      // Build a synthetic rule execution to test the delivery target
      const actionType = target.type as any;
      const actionConfig = target.config as any;

      // Use processEvent-style execution for testing:
      // Create a temporary rule-like structure and execute the action
      const startedAt = new Date();
      try {
        const webhookUrl = actionConfig.webhookUrl || actionConfig.slackWebhookUrl;
        let result: Record<string, unknown> = {};

        if (target.type === "SLACK" && actionConfig.slackWebhookUrl) {
          const response = await fetch(actionConfig.slackWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `[Test] ${JSON.stringify(testPayload)}`,
              channel: actionConfig.slackChannel,
            }),
          });
          result = { sent: true, status: response.status };
        } else if (target.type === "WEBHOOK" && actionConfig.webhookUrl) {
          const response = await fetch(actionConfig.webhookUrl, {
            method: (actionConfig.webhookMethod as string) ?? "POST",
            headers: {
              "Content-Type": "application/json",
              ...((actionConfig.webhookHeaders as Record<string, string>) ?? {}),
            },
            body: JSON.stringify(testPayload),
          });
          result = { sent: true, status: response.status };
        } else if (target.type === "EMAIL") {
          // Email testing would integrate with the email provider in production
          result = { sent: true, message: "Test email queued" };
        } else {
          result = { sent: true, message: `Test delivery for type '${target.type}' acknowledged` };
        }

        const durationMs = new Date().getTime() - startedAt.getTime();
        res.json({ success: true, result, durationMs });
      } catch (deliveryErr) {
        const durationMs = new Date().getTime() - startedAt.getTime();
        res.status(502).json({
          success: false,
          error: deliveryErr instanceof Error ? deliveryErr.message : "Delivery failed",
          durationMs,
        });
      }
    } catch (err) {
      console.error("Test delivery error:", err);
      res.status(500).json({ error: "Failed to test delivery target" });
    }
  });

  return router;
}
