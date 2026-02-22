/**
 * CRM Writeback Routes
 *
 * Provides the API surface for CRM writeback operations:
 *
 *   GET    /api/crm-writebacks                     - List writeback actions (filtered)
 *   POST   /api/crm-writebacks                     - Create a new writeback action
 *   GET    /api/crm-writebacks/pending              - Get pending approvals (admin only)
 *   POST   /api/crm-writebacks/:actionId/approve    - Approve a writeback (admin only)
 *   POST   /api/crm-writebacks/:actionId/reject     - Reject a writeback (admin only)
 *   POST   /api/crm-writebacks/:actionId/execute    - Execute a writeback (admin only)
 *   POST   /api/crm-writebacks/:actionId/rollback   - Rollback a writeback (admin only)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { CrmWritebackService } from "../services/crm-writeback.js";

// ─── Validation ──────────────────────────────────────────────────────────────

const CreateWritebackSchema = z.object({
  crmProvider: z.string().min(1),
  writebackType: z.enum(["TASK", "NOTE", "FIELD_UPDATE", "TIMELINE_EVENT", "OPPORTUNITY_UPDATE"]),
  targetObjectType: z.string().min(1),
  targetObjectId: z.string().min(1),
  payload: z.record(z.unknown()),
});

const RejectWritebackSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required"),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ["OWNER", "ADMIN"];

function isAdmin(req: Request): boolean {
  return ADMIN_ROLES.includes((req as any).userRole);
}

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createCrmWritebackRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const writebackService = new CrmWritebackService(prisma);

  // ── List Writeback Actions ──────────────────────────────────────────

  /**
   * GET /api/crm-writebacks
   *
   * Returns a filtered, paginated list of writeback actions for the
   * authenticated user's organization.
   *
   * Query params:
   *   status   - Filter by writeback status
   *   provider - Filter by CRM provider
   *   limit    - Max results (default: 50)
   *   offset   - Number of records to skip (default: 0)
   */
  router.get("/", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const status = req.query.status as string | undefined;
      const provider = req.query.provider as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const actions = await writebackService.getWritebacks(organizationId, {
        status,
        provider,
        limit,
      });

      // Apply offset on the returned results
      const paged = offset > 0 ? actions.slice(offset) : actions;

      res.json({ actions: paged, total: actions.length });
    } catch (err) {
      console.error("List writeback actions error:", err);
      res.status(500).json({ error: "Failed to list writeback actions" });
    }
  });

  // ── Create Writeback Action ─────────────────────────────────────────

  /**
   * POST /api/crm-writebacks
   *
   * Creates a new writeback action. Depending on the organization's policy,
   * it may be created in PENDING_APPROVAL or APPROVED status.
   */
  router.post("/", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    const userId = (req as any).userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = CreateWritebackSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const action = await writebackService.createWriteback({
        organizationId,
        crmProvider: parse.data.crmProvider,
        writebackType: parse.data.writebackType,
        targetObjectType: parse.data.targetObjectType,
        targetObjectId: parse.data.targetObjectId,
        payload: parse.data.payload,
        requestedById: userId,
      });

      res.status(201).json({ action });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create writeback";
      console.error("Create writeback error:", err);
      res.status(400).json({ error: message });
    }
  });

  // ── Get Pending Approvals (Admin Only) ──────────────────────────────

  /**
   * GET /api/crm-writebacks/pending
   *
   * Returns all writeback actions awaiting approval. Admin only.
   */
  router.get("/pending", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    try {
      const actions = await writebackService.getPendingApprovals(organizationId);
      res.json({ actions });
    } catch (err) {
      console.error("Get pending approvals error:", err);
      res.status(500).json({ error: "Failed to load pending approvals" });
    }
  });

  // ── Approve Writeback (Admin Only) ──────────────────────────────────

  /**
   * POST /api/crm-writebacks/:actionId/approve
   *
   * Approves a pending writeback action. Admin only.
   */
  router.post("/:actionId/approve", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    const userId = (req as any).userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    try {
      await writebackService.approveWriteback(req.params.actionId as string, userId);
      res.json({ approved: true, actionId: req.params.actionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to approve writeback";
      console.error("Approve writeback error:", err);
      res.status(400).json({ error: message });
    }
  });

  // ── Reject Writeback (Admin Only) ───────────────────────────────────

  /**
   * POST /api/crm-writebacks/:actionId/reject
   *
   * Rejects a pending writeback action with a reason. Admin only.
   */
  router.post("/:actionId/reject", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    const userId = (req as any).userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = RejectWritebackSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      await writebackService.rejectWriteback(req.params.actionId as string, userId, parse.data.reason);
      res.json({ rejected: true, actionId: req.params.actionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reject writeback";
      console.error("Reject writeback error:", err);
      res.status(400).json({ error: message });
    }
  });

  // ── Execute Writeback (Admin Only) ──────────────────────────────────

  /**
   * POST /api/crm-writebacks/:actionId/execute
   *
   * Executes an approved writeback action against the CRM. Admin only.
   * Captures current state for rollback before executing.
   */
  router.post("/:actionId/execute", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    try {
      const result = await writebackService.executeWriteback(req.params.actionId as string);

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json({ executed: true, actionId: req.params.actionId });
    } catch (err) {
      console.error("Execute writeback error:", err);
      res.status(500).json({ error: "Failed to execute writeback" });
    }
  });

  // ── Rollback Writeback (Admin Only) ─────────────────────────────────

  /**
   * POST /api/crm-writebacks/:actionId/rollback
   *
   * Rolls back a completed writeback action using the stored previous state.
   * Admin only.
   */
  router.post("/:actionId/rollback", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    try {
      const result = await writebackService.rollbackWriteback(req.params.actionId as string);

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json({ rolledBack: true, actionId: req.params.actionId });
    } catch (err) {
      console.error("Rollback writeback error:", err);
      res.status(500).json({ error: "Failed to rollback writeback" });
    }
  });

  return router;
}
