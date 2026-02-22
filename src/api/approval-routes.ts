/**
 * Approval Workflow API Routes
 *
 * Endpoints for managing approval workflows and approval requests.
 * Workflows define multi-step approval processes for various target types.
 * Requests track individual items moving through those workflows.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";

// ─── Validation ──────────────────────────────────────────────────────────────

const ApprovalTargetTypeEnum = z.enum([
  "LANDING_PAGE",
  "STORY",
  "DELETION_REQUEST",
  "ARTIFACT_VERSION",
]);

const CreateWorkflowSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  targetType: ApprovalTargetTypeEnum,
  stepsJson: z.unknown(),
  enabled: z.boolean().optional().default(true),
});

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targetType: ApprovalTargetTypeEnum.optional(),
  stepsJson: z.unknown().optional(),
  enabled: z.boolean().optional(),
});

const ListRequestsQuerySchema = z.object({
  state: z
    .enum(["PENDING", "APPROVED", "REJECTED", "CANCELED", "EXPIRED"])
    .optional(),
  targetType: ApprovalTargetTypeEnum.optional(),
});

const CreateRequestSchema = z.object({
  workflowId: z.string().min(1, "Workflow ID is required"),
  targetType: ApprovalTargetTypeEnum,
  targetId: z.string().min(1, "Target ID is required"),
});

const ReviewRequestSchema = z.object({
  reviewNote: z.string().max(1000).optional(),
});

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createApprovalRoutes(prisma: PrismaClient): Router {
  const router = Router();

  // ── Helper: check admin role ────────────────────────────────────────

  function isAdmin(req: Request): boolean {
    const role = (req as any).userRole;
    return role === "OWNER" || role === "ADMIN";
  }

  // ══════════════════════════════════════════════════════════════════════
  //  WORKFLOW ROUTES
  // ══════════════════════════════════════════════════════════════════════

  /**
   * GET /workflows
   *
   * List all approval workflows for the organization.
   */
  router.get("/workflows", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const workflows = await prisma.approvalWorkflow.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      });

      res.json({ workflows });
    } catch (err) {
      console.error("List approval workflows error:", err);
      res.status(500).json({ error: "Failed to list approval workflows" });
    }
  });

  /**
   * POST /workflows
   *
   * Create a new approval workflow. Admin only.
   */
  router.post("/workflows", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parseResult = CreateWorkflowSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: "validation_error",
        details: parseResult.error.issues,
      });
      return;
    }

    const { name, targetType, stepsJson, enabled } = parseResult.data;

    try {
      const workflow = await prisma.approvalWorkflow.create({
        data: {
          organizationId,
          name,
          targetType,
          stepsJson: stepsJson as any,
          enabled,
        },
      });

      res.status(201).json({ workflow });
    } catch (err) {
      console.error("Create approval workflow error:", err);
      res.status(500).json({ error: "Failed to create approval workflow" });
    }
  });

  /**
   * PATCH /workflows/:workflowId
   *
   * Update an existing approval workflow. Admin only.
   */
  router.patch(
    "/workflows/:workflowId",
    async (req: Request, res: Response) => {
      const organizationId = (req as any).organizationId;
      if (!organizationId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (!isAdmin(req)) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const parseResult = UpdateWorkflowSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: "validation_error",
          details: parseResult.error.issues,
        });
        return;
      }

      const workflowId = req.params.workflowId as string;

      try {
        const existing = await prisma.approvalWorkflow.findFirst({
          where: { id: workflowId, organizationId },
        });

        if (!existing) {
          res.status(404).json({ error: "Workflow not found" });
          return;
        }

        const data: Record<string, unknown> = {};
        if (parseResult.data.name !== undefined) data.name = parseResult.data.name;
        if (parseResult.data.targetType !== undefined) data.targetType = parseResult.data.targetType;
        if (parseResult.data.stepsJson !== undefined) data.stepsJson = parseResult.data.stepsJson as any;
        if (parseResult.data.enabled !== undefined) data.enabled = parseResult.data.enabled;

        const workflow = await prisma.approvalWorkflow.update({
          where: { id: workflowId },
          data,
        });

        res.json({ workflow });
      } catch (err) {
        console.error("Update approval workflow error:", err);
        res.status(500).json({ error: "Failed to update approval workflow" });
      }
    }
  );

  /**
   * DELETE /workflows/:workflowId
   *
   * Delete an approval workflow. Admin only.
   */
  router.delete(
    "/workflows/:workflowId",
    async (req: Request, res: Response) => {
      const organizationId = (req as any).organizationId;
      if (!organizationId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (!isAdmin(req)) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const workflowId = req.params.workflowId as string;

      try {
        const existing = await prisma.approvalWorkflow.findFirst({
          where: { id: workflowId, organizationId },
        });

        if (!existing) {
          res.status(404).json({ error: "Workflow not found" });
          return;
        }

        await prisma.approvalWorkflow.delete({ where: { id: workflowId } });

        res.json({ deleted: true });
      } catch (err) {
        console.error("Delete approval workflow error:", err);
        res.status(500).json({ error: "Failed to delete approval workflow" });
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  //  REQUEST ROUTES
  // ══════════════════════════════════════════════════════════════════════

  /**
   * GET /requests
   *
   * List approval requests for the organization.
   * Optional query filters: state, targetType
   */
  router.get("/requests", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parseResult = ListRequestsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        error: "validation_error",
        details: parseResult.error.issues,
      });
      return;
    }

    const { state, targetType } = parseResult.data;

    try {
      const where: Record<string, unknown> = { organizationId };
      if (state) where.state = state;
      if (targetType) where.targetType = targetType;

      const requests = await prisma.approvalRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      res.json({ requests });
    } catch (err) {
      console.error("List approval requests error:", err);
      res.status(500).json({ error: "Failed to list approval requests" });
    }
  });

  /**
   * POST /requests
   *
   * Create a new approval request.
   */
  router.post("/requests", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId;
    const userId = (req as any).userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parseResult = CreateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: "validation_error",
        details: parseResult.error.issues,
      });
      return;
    }

    const { workflowId, targetType, targetId } = parseResult.data;

    try {
      // Verify workflow exists and belongs to the org
      const workflow = await prisma.approvalWorkflow.findFirst({
        where: { id: workflowId, organizationId, enabled: true },
      });

      if (!workflow) {
        res.status(404).json({ error: "Workflow not found or not enabled" });
        return;
      }

      const approvalRequest = await prisma.approvalRequest.create({
        data: {
          organizationId,
          workflowId,
          targetType,
          targetId,
          requesterId: userId,
          state: "PENDING",
          currentStep: 0,
        },
      });

      res.status(201).json({ request: approvalRequest });
    } catch (err) {
      console.error("Create approval request error:", err);
      res.status(500).json({ error: "Failed to create approval request" });
    }
  });

  /**
   * POST /requests/:requestId/approve
   *
   * Approve an approval request. Admin only.
   */
  router.post(
    "/requests/:requestId/approve",
    async (req: Request, res: Response) => {
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

      const parseResult = ReviewRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: "validation_error",
          details: parseResult.error.issues,
        });
        return;
      }

      const requestId = req.params.requestId as string;

      try {
        const approvalRequest = await prisma.approvalRequest.findFirst({
          where: { id: requestId, organizationId },
        });

        if (!approvalRequest) {
          res.status(404).json({ error: "Approval request not found" });
          return;
        }

        if (approvalRequest.state !== "PENDING") {
          res.status(409).json({
            error: "invalid_state",
            message: `Cannot approve a request in state "${approvalRequest.state}".`,
          });
          return;
        }

        const updated = await prisma.approvalRequest.update({
          where: { id: requestId },
          data: {
            state: "APPROVED",
            reviewerId: userId,
            reviewNote: parseResult.data.reviewNote ?? null,
            reviewedAt: new Date(),
          },
        });

        res.json({ request: updated });
      } catch (err) {
        console.error("Approve request error:", err);
        res.status(500).json({ error: "Failed to approve request" });
      }
    }
  );

  /**
   * POST /requests/:requestId/reject
   *
   * Reject an approval request. Admin only.
   */
  router.post(
    "/requests/:requestId/reject",
    async (req: Request, res: Response) => {
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

      const parseResult = ReviewRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: "validation_error",
          details: parseResult.error.issues,
        });
        return;
      }

      const requestId = req.params.requestId as string;

      try {
        const approvalRequest = await prisma.approvalRequest.findFirst({
          where: { id: requestId, organizationId },
        });

        if (!approvalRequest) {
          res.status(404).json({ error: "Approval request not found" });
          return;
        }

        if (approvalRequest.state !== "PENDING") {
          res.status(409).json({
            error: "invalid_state",
            message: `Cannot reject a request in state "${approvalRequest.state}".`,
          });
          return;
        }

        const updated = await prisma.approvalRequest.update({
          where: { id: requestId },
          data: {
            state: "REJECTED",
            reviewerId: userId,
            reviewNote: parseResult.data.reviewNote ?? null,
            reviewedAt: new Date(),
          },
        });

        res.json({ request: updated });
      } catch (err) {
        console.error("Reject request error:", err);
        res.status(500).json({ error: "Failed to reject request" });
      }
    }
  );

  /**
   * POST /requests/:requestId/cancel
   *
   * Cancel an approval request. Only the original requester can cancel.
   */
  router.post(
    "/requests/:requestId/cancel",
    async (req: Request, res: Response) => {
      const organizationId = (req as any).organizationId;
      const userId = (req as any).userId;
      if (!organizationId || !userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const requestId = req.params.requestId as string;

      try {
        const approvalRequest = await prisma.approvalRequest.findFirst({
          where: { id: requestId, organizationId },
        });

        if (!approvalRequest) {
          res.status(404).json({ error: "Approval request not found" });
          return;
        }

        if (approvalRequest.requesterId !== userId) {
          res.status(403).json({
            error: "permission_denied",
            message: "Only the original requester can cancel this request.",
          });
          return;
        }

        if (approvalRequest.state !== "PENDING") {
          res.status(409).json({
            error: "invalid_state",
            message: `Cannot cancel a request in state "${approvalRequest.state}".`,
          });
          return;
        }

        const updated = await prisma.approvalRequest.update({
          where: { id: requestId },
          data: {
            state: "CANCELED",
          },
        });

        res.json({ request: updated });
      } catch (err) {
        console.error("Cancel request error:", err);
        res.status(500).json({ error: "Failed to cancel request" });
      }
    }
  );

  return router;
}
