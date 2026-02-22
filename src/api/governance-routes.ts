/**
 * Data Governance API Routes
 *
 * Provides endpoints for managing data governance policies, retention jobs,
 * legal holds, and deletion requests with approval workflows.
 *
 * Endpoints:
 *   GET    /policy                          — Get governance policy for org
 *   PUT    /policy                          — Update governance policy (admin only)
 *   GET    /retention                       — List retention jobs
 *   POST   /retention                       — Create retention job (admin only)
 *   POST   /retention/:jobId/execute        — Execute retention job (admin only)
 *   GET    /legal-holds                     — List active legal holds
 *   POST   /legal-holds                     — Create legal hold (admin only)
 *   POST   /legal-holds/:holdId/release     — Release legal hold (admin only)
 *   GET    /deletion-requests               — List deletion requests
 *   POST   /deletion-requests               — Create deletion request
 *   POST   /deletion-requests/:requestId/approve — Approve deletion (admin only)
 *   POST   /deletion-requests/:requestId/reject  — Reject deletion (admin only)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { DataGovernanceService } from "../services/data-governance.js";

// ─── Validation Schemas ─────────────────────────────────────────────────────

const UpdatePolicySchema = z.object({
  retentionDays: z.number().int().min(1).optional(),
  legalHoldEnabled: z.boolean().optional(),
  piiExportEnabled: z.boolean().optional(),
  deletionRequiresApproval: z.boolean().optional(),
  allowNamedStoryExports: z.boolean().optional(),
  autoDeleteAfterRetention: z.boolean().optional(),
  retentionExemptAccountIds: z.array(z.string()).optional(),
});

const CreateRetentionJobSchema = z.object({
  targetType: z.string().min(1),
});

const CreateLegalHoldSchema = z.object({
  scope: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().optional(),
  reason: z.string().min(1),
});

const CreateDeletionRequestSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  reason: z.string().min(1),
});

const RejectDeletionSchema = z.object({
  reason: z.string().min(1),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function isAdmin(req: Request): boolean {
  const role = (req as any).userRole as string | undefined;
  return !!role && ["OWNER", "ADMIN"].includes(role);
}

// ─── Route Factory ──────────────────────────────────────────────────────────

export function createGovernanceRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new DataGovernanceService(prisma);

  // ── GET /policy ─────────────────────────────────────────────────────

  /**
   * GET /policy
   *
   * Returns the governance policy for the current organization.
   */
  router.get("/policy", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const policy = await service.getPolicy(organizationId);
      res.json({ policy });
    } catch (err) {
      console.error("Get governance policy error:", err);
      res.status(500).json({ error: "Failed to load governance policy" });
    }
  });

  // ── PUT /policy ─────────────────────────────────────────────────────

  /**
   * PUT /policy
   *
   * Updates the governance policy. Admin only.
   */
  router.put("/policy", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = UpdatePolicySchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const policy = await service.updatePolicy(organizationId, parse.data);
      res.json({ policy });
    } catch (err) {
      console.error("Update governance policy error:", err);
      res.status(500).json({ error: "Failed to update governance policy" });
    }
  });

  // ── GET /retention ──────────────────────────────────────────────────

  /**
   * GET /retention
   *
   * Lists retention jobs for the organization.
   */
  router.get("/retention", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const jobs = await service.getRetentionJobs(organizationId);
      res.json({ jobs });
    } catch (err) {
      console.error("List retention jobs error:", err);
      res.status(500).json({ error: "Failed to load retention jobs" });
    }
  });

  // ── POST /retention ─────────────────────────────────────────────────

  /**
   * POST /retention
   *
   * Creates a new retention job. Admin only.
   */
  router.post("/retention", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = CreateRetentionJobSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const job = await service.createRetentionJob(organizationId, parse.data.targetType);
      res.status(201).json({ job });
    } catch (err) {
      console.error("Create retention job error:", err);
      res.status(500).json({ error: "Failed to create retention job" });
    }
  });

  // ── POST /retention/:jobId/execute ──────────────────────────────────

  /**
   * POST /retention/:jobId/execute
   *
   * Executes a pending retention job. Admin only.
   */
  router.post("/retention/:jobId/execute", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    try {
      const job = await service.executeRetentionJob(req.params.jobId as string);
      res.json({ job });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to execute retention job";
      console.error("Execute retention job error:", err);
      res.status(400).json({ error: message });
    }
  });

  // ── GET /legal-holds ────────────────────────────────────────────────

  /**
   * GET /legal-holds
   *
   * Lists active legal holds for the organization.
   */
  router.get("/legal-holds", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const holds = await service.getActiveLegalHolds(organizationId);
      res.json({ holds });
    } catch (err) {
      console.error("List legal holds error:", err);
      res.status(500).json({ error: "Failed to load legal holds" });
    }
  });

  // ── POST /legal-holds ───────────────────────────────────────────────

  /**
   * POST /legal-holds
   *
   * Creates a new legal hold. Admin only.
   */
  router.post("/legal-holds", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = CreateLegalHoldSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const hold = await service.createLegalHold({
        organizationId,
        scope: parse.data.scope,
        targetType: parse.data.targetType,
        targetId: parse.data.targetId,
        reason: parse.data.reason,
        createdById: userId,
      });
      res.status(201).json({ hold });
    } catch (err) {
      console.error("Create legal hold error:", err);
      res.status(500).json({ error: "Failed to create legal hold" });
    }
  });

  // ── POST /legal-holds/:holdId/release ───────────────────────────────

  /**
   * POST /legal-holds/:holdId/release
   *
   * Releases an active legal hold. Admin only.
   */
  router.post("/legal-holds/:holdId/release", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    try {
      await service.releaseLegalHold(req.params.holdId as string);
      res.json({ released: true });
    } catch (err) {
      console.error("Release legal hold error:", err);
      res.status(500).json({ error: "Failed to release legal hold" });
    }
  });

  // ── GET /deletion-requests ──────────────────────────────────────────

  /**
   * GET /deletion-requests
   *
   * Lists deletion requests for the organization.
   * Optional query param: status (filter by request status)
   */
  router.get("/deletion-requests", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const status = req.query.status as string | undefined;
      const requests = await service.getDeletionRequests(organizationId, status);
      res.json({ requests });
    } catch (err) {
      console.error("List deletion requests error:", err);
      res.status(500).json({ error: "Failed to load deletion requests" });
    }
  });

  // ── POST /deletion-requests ─────────────────────────────────────────

  /**
   * POST /deletion-requests
   *
   * Creates a new deletion request. Any authenticated user can request.
   */
  router.post("/deletion-requests", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = CreateDeletionRequestSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const request = await service.requestDeletion({
        organizationId,
        requestedById: userId,
        targetType: parse.data.targetType,
        targetId: parse.data.targetId,
        reason: parse.data.reason,
      });
      res.status(201).json({ request });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create deletion request";
      console.error("Create deletion request error:", err);
      res.status(400).json({ error: message });
    }
  });

  // ── POST /deletion-requests/:requestId/approve ─────────────────────

  /**
   * POST /deletion-requests/:requestId/approve
   *
   * Approves a pending deletion request and executes the deletion. Admin only.
   */
  router.post("/deletion-requests/:requestId/approve", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    try {
      await service.approveDeletion(req.params.requestId as string, userId);
      res.json({ approved: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to approve deletion request";
      console.error("Approve deletion request error:", err);
      res.status(400).json({ error: message });
    }
  });

  // ── POST /deletion-requests/:requestId/reject ──────────────────────

  /**
   * POST /deletion-requests/:requestId/reject
   *
   * Rejects a pending deletion request. Admin only.
   */
  router.post("/deletion-requests/:requestId/reject", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = RejectDeletionSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      await service.rejectDeletion(req.params.requestId as string, userId, parse.data.reason);
      res.json({ rejected: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reject deletion request";
      console.error("Reject deletion request error:", err);
      res.status(400).json({ error: message });
    }
  });

  return router;
}
