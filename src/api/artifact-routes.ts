/**
 * Artifact Versioning & Publish Approval Routes
 *
 * Endpoints for managing artifact version history and publish approval workflows.
 * Supports versioning for landing pages, stories, reports, and templates.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient, Prisma } from "@prisma/client";

// ─── Validation ──────────────────────────────────────────────────────────────

const ArtifactTypeEnum = z.enum(["LANDING_PAGE", "STORY", "REPORT", "TEMPLATE"]);

const ListVersionsQuerySchema = z.object({
  artifactType: ArtifactTypeEnum.optional(),
  artifactId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const CreateVersionSchema = z.object({
  artifactType: ArtifactTypeEnum,
  artifactId: z.string().min(1),
  contentSnapshot: z.record(z.unknown()),
  changeNote: z.string().max(500).optional(),
});

const PublishApprovalStatusEnum = z.enum(["PENDING", "APPROVED", "REJECTED", "REVOKED"]);

const ListApprovalsQuerySchema = z.object({
  status: PublishApprovalStatusEnum.optional(),
  artifactType: ArtifactTypeEnum.optional(),
});

const RequestApprovalSchema = z.object({
  artifactType: ArtifactTypeEnum,
  artifactId: z.string().min(1),
  version: z.number().int().min(1),
});

const ReviewNoteSchema = z.object({
  reviewNote: z.string().max(1000).optional(),
});

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createArtifactRoutes(prisma: PrismaClient): Router {
  const router = Router();

  const isAdmin = (req: Request): boolean => {
    const role = (req as any).userRole;
    return !!role && ["OWNER", "ADMIN"].includes(role);
  };

  // ── GET /versions ─────────────────────────────────────────────────────
  // List artifact versions with optional filters.

  router.get("/versions", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parseResult = ListVersionsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: "validation_error", details: parseResult.error.issues });
      return;
    }

    const { artifactType, artifactId, limit = 50, offset = 0 } = parseResult.data;

    try {
      const where: Record<string, unknown> = { organizationId };
      if (artifactType) where.artifactType = artifactType;
      if (artifactId) where.artifactId = artifactId;

      const [versions, total] = await Promise.all([
        prisma.artifactVersion.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.artifactVersion.count({ where }),
      ]);

      res.json({
        versions: versions.map((v) => ({
          id: v.id,
          artifactType: v.artifactType,
          artifactId: v.artifactId,
          version: v.version,
          contentSnapshot: v.contentSnapshot,
          changeNote: v.changeNote,
          createdById: v.createdById,
          createdAt: v.createdAt,
        })),
        total,
        limit,
        offset,
      });
    } catch (err) {
      console.error("List artifact versions error:", err);
      res.status(500).json({ error: "Failed to list artifact versions" });
    }
  });

  // ── GET /versions/:versionId ──────────────────────────────────────────
  // Get a specific version by ID.

  router.get("/versions/:versionId", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const versionId = req.params.versionId as string;

    try {
      const version = await prisma.artifactVersion.findFirst({
        where: { id: versionId, organizationId },
      });

      if (!version) {
        res.status(404).json({ error: "Artifact version not found" });
        return;
      }

      res.json({
        id: version.id,
        artifactType: version.artifactType,
        artifactId: version.artifactId,
        version: version.version,
        contentSnapshot: version.contentSnapshot,
        changeNote: version.changeNote,
        createdById: version.createdById,
        createdAt: version.createdAt,
      });
    } catch (err) {
      console.error("Get artifact version error:", err);
      res.status(500).json({ error: "Failed to retrieve artifact version" });
    }
  });

  // ── POST /versions ────────────────────────────────────────────────────
  // Create a new artifact version. Auto-increments the version number.

  router.post("/versions", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parseResult = CreateVersionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "validation_error", details: parseResult.error.issues });
      return;
    }

    const { artifactType, artifactId, contentSnapshot, changeNote } = parseResult.data;

    try {
      // Find the current max version for this artifact and auto-increment
      const latest = await prisma.artifactVersion.findFirst({
        where: { organizationId, artifactType, artifactId },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      const nextVersion = (latest?.version ?? 0) + 1;

      const version = await prisma.artifactVersion.create({
        data: {
          organizationId,
          artifactType,
          artifactId,
          version: nextVersion,
          contentSnapshot: contentSnapshot as Prisma.InputJsonValue,
          changeNote: changeNote ?? null,
          createdById: userId,
        },
      });

      res.status(201).json({
        id: version.id,
        artifactType: version.artifactType,
        artifactId: version.artifactId,
        version: version.version,
        contentSnapshot: version.contentSnapshot,
        changeNote: version.changeNote,
        createdById: version.createdById,
        createdAt: version.createdAt,
      });
    } catch (err) {
      console.error("Create artifact version error:", err);
      res.status(500).json({ error: "Failed to create artifact version" });
    }
  });

  // ── GET /publish-approvals ────────────────────────────────────────────
  // List publish approvals with optional status and type filters.

  router.get("/publish-approvals", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parseResult = ListApprovalsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: "validation_error", details: parseResult.error.issues });
      return;
    }

    const { status, artifactType } = parseResult.data;

    try {
      const where: Record<string, unknown> = { organizationId };
      if (status) where.status = status;
      if (artifactType) where.artifactType = artifactType;

      const approvals = await prisma.publishApproval.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      res.json({
        approvals: approvals.map((a) => ({
          id: a.id,
          artifactType: a.artifactType,
          artifactId: a.artifactId,
          version: a.version,
          requesterId: a.requesterId,
          reviewerId: a.reviewerId,
          status: a.status,
          reviewNote: a.reviewNote,
          reviewedAt: a.reviewedAt,
          expiresAt: a.expiresAt,
          createdAt: a.createdAt,
        })),
      });
    } catch (err) {
      console.error("List publish approvals error:", err);
      res.status(500).json({ error: "Failed to list publish approvals" });
    }
  });

  // ── POST /publish-approvals ───────────────────────────────────────────
  // Request a new publish approval.

  router.post("/publish-approvals", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parseResult = RequestApprovalSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "validation_error", details: parseResult.error.issues });
      return;
    }

    const { artifactType, artifactId, version } = parseResult.data;

    try {
      // Verify the referenced artifact version exists
      const artifactVersion = await prisma.artifactVersion.findFirst({
        where: { organizationId, artifactType, artifactId, version },
      });

      if (!artifactVersion) {
        res.status(404).json({ error: "Artifact version not found" });
        return;
      }

      // Check for an existing pending approval for the same artifact + version
      const existing = await prisma.publishApproval.findFirst({
        where: {
          organizationId,
          artifactType,
          artifactId,
          version,
          status: "PENDING",
        },
      });

      if (existing) {
        res.status(409).json({
          error: "approval_already_pending",
          message: "A pending publish approval already exists for this artifact version.",
        });
        return;
      }

      const approval = await prisma.publishApproval.create({
        data: {
          organizationId,
          artifactType,
          artifactId,
          version,
          requesterId: userId,
          status: "PENDING",
        },
      });

      res.status(201).json({
        id: approval.id,
        artifactType: approval.artifactType,
        artifactId: approval.artifactId,
        version: approval.version,
        requesterId: approval.requesterId,
        status: approval.status,
        createdAt: approval.createdAt,
      });
    } catch (err) {
      console.error("Request publish approval error:", err);
      res.status(500).json({ error: "Failed to request publish approval" });
    }
  });

  // ── POST /publish-approvals/:approvalId/approve ───────────────────────
  // Approve a pending publish request. Admin only.

  router.post(
    "/publish-approvals/:approvalId/approve",
    async (req: Request, res: Response) => {
      const organizationId = (req as any).organizationId as string;
      const userId = (req as any).userId as string;
      if (!organizationId || !userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (!isAdmin(req)) {
        res.status(403).json({
          error: "permission_denied",
          message: "Only admins and owners can approve publish requests.",
        });
        return;
      }

      const parse = ReviewNoteSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({ error: "validation_error", details: parse.error.issues });
        return;
      }

      const approvalId = req.params.approvalId as string;

      try {
        const approval = await prisma.publishApproval.findFirst({
          where: { id: approvalId, organizationId },
        });

        if (!approval) {
          res.status(404).json({ error: "Publish approval not found" });
          return;
        }

        if (approval.status !== "PENDING") {
          res.status(409).json({
            error: "invalid_status",
            message: `Cannot approve a request with status "${approval.status}".`,
          });
          return;
        }

        const updated = await prisma.publishApproval.update({
          where: { id: approvalId },
          data: {
            status: "APPROVED",
            reviewerId: userId,
            reviewNote: parse.data.reviewNote ?? null,
            reviewedAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        });

        res.json({
          id: updated.id,
          status: updated.status,
          reviewerId: updated.reviewerId,
          reviewNote: updated.reviewNote,
          reviewedAt: updated.reviewedAt,
          expiresAt: updated.expiresAt,
        });
      } catch (err) {
        console.error("Approve publish error:", err);
        res.status(500).json({ error: "Failed to approve publish request" });
      }
    }
  );

  // ── POST /publish-approvals/:approvalId/reject ────────────────────────
  // Reject a pending publish request. Admin only.

  router.post(
    "/publish-approvals/:approvalId/reject",
    async (req: Request, res: Response) => {
      const organizationId = (req as any).organizationId as string;
      const userId = (req as any).userId as string;
      if (!organizationId || !userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (!isAdmin(req)) {
        res.status(403).json({
          error: "permission_denied",
          message: "Only admins and owners can reject publish requests.",
        });
        return;
      }

      const parse = ReviewNoteSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({ error: "validation_error", details: parse.error.issues });
        return;
      }

      const approvalId = req.params.approvalId as string;

      try {
        const approval = await prisma.publishApproval.findFirst({
          where: { id: approvalId, organizationId },
        });

        if (!approval) {
          res.status(404).json({ error: "Publish approval not found" });
          return;
        }

        if (approval.status !== "PENDING") {
          res.status(409).json({
            error: "invalid_status",
            message: `Cannot reject a request with status "${approval.status}".`,
          });
          return;
        }

        const updated = await prisma.publishApproval.update({
          where: { id: approvalId },
          data: {
            status: "REJECTED",
            reviewerId: userId,
            reviewNote: parse.data.reviewNote ?? null,
            reviewedAt: new Date(),
          },
        });

        res.json({
          id: updated.id,
          status: updated.status,
          reviewerId: updated.reviewerId,
          reviewNote: updated.reviewNote,
          reviewedAt: updated.reviewedAt,
        });
      } catch (err) {
        console.error("Reject publish error:", err);
        res.status(500).json({ error: "Failed to reject publish request" });
      }
    }
  );

  // ── POST /publish-approvals/:approvalId/revoke ────────────────────────
  // Revoke a previously approved publish. Admin only.

  router.post(
    "/publish-approvals/:approvalId/revoke",
    async (req: Request, res: Response) => {
      const organizationId = (req as any).organizationId as string;
      const userId = (req as any).userId as string;
      if (!organizationId || !userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (!isAdmin(req)) {
        res.status(403).json({
          error: "permission_denied",
          message: "Only admins and owners can revoke publish approvals.",
        });
        return;
      }

      const parse = ReviewNoteSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({ error: "validation_error", details: parse.error.issues });
        return;
      }

      const approvalId = req.params.approvalId as string;

      try {
        const approval = await prisma.publishApproval.findFirst({
          where: { id: approvalId, organizationId },
        });

        if (!approval) {
          res.status(404).json({ error: "Publish approval not found" });
          return;
        }

        if (approval.status !== "APPROVED") {
          res.status(409).json({
            error: "invalid_status",
            message: `Cannot revoke a request with status "${approval.status}". Only approved requests can be revoked.`,
          });
          return;
        }

        const updated = await prisma.publishApproval.update({
          where: { id: approvalId },
          data: {
            status: "REVOKED",
            reviewerId: userId,
            reviewNote: parse.data.reviewNote ?? null,
            reviewedAt: new Date(),
            expiresAt: null,
          },
        });

        res.json({
          id: updated.id,
          status: updated.status,
          reviewerId: updated.reviewerId,
          reviewNote: updated.reviewNote,
          reviewedAt: updated.reviewedAt,
        });
      } catch (err) {
        console.error("Revoke publish approval error:", err);
        res.status(500).json({ error: "Failed to revoke publish approval" });
      }
    }
  );

  return router;
}
