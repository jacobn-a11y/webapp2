/**
 * Merge Preview & Shared Asset Routes
 *
 * Provides the API surface for merge previews and shared assets:
 *
 *   GET    /previews                  — List merge previews
 *   POST   /previews                  — Create a merge preview
 *   GET    /previews/:previewId       — Get specific preview details
 *   POST   /previews/:previewId/apply — Apply merge (admin only)
 *   POST   /previews/:previewId/discard — Discard preview
 *
 *   GET    /assets                    — List shared assets
 *   POST   /assets                    — Create shared asset
 *   PATCH  /assets/:assetId           — Update shared asset
 *   DELETE /assets/:assetId           — Delete shared asset (admin only)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";

// ─── Validation ──────────────────────────────────────────────────────────────

const CreateMergePreviewSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
});

const ListPreviewsQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const CreateSharedAssetSchema = z.object({
  assetType: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  storageUrl: z.string().url(),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().min(0),
  thumbnailUrl: z.string().url().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

const UpdateSharedAssetSchema = z.object({
  assetType: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  storageUrl: z.string().url().optional(),
  mimeType: z.string().min(1).optional(),
  fileSizeBytes: z.number().int().min(0).optional(),
  thumbnailUrl: z.string().url().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

const ListAssetsQuerySchema = z.object({
  assetType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createMergePreviewRoutes(prisma: PrismaClient): Router {
  const router = Router();

  // ── Merge Previews ──────────────────────────────────────────────────

  /**
   * GET /previews
   *
   * Lists merge previews for the current organization.
   * Supports filtering by status and pagination via limit/offset.
   */
  router.get("/previews", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = ListPreviewsQuerySchema.safeParse(req.query);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    const { status, limit = 25, offset = 0 } = parse.data;

    try {
      const where: Record<string, unknown> = { organizationId };
      if (status) {
        where.status = status;
      }

      const [previews, total] = await Promise.all([
        prisma.mergePreview.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.mergePreview.count({ where }),
      ]);

      res.json({ previews, total, limit, offset });
    } catch (err) {
      console.error("List merge previews error:", err);
      res.status(500).json({ error: "Failed to list merge previews" });
    }
  });

  /**
   * POST /previews
   *
   * Creates a new merge preview. Sets initial status to COMPUTING,
   * computes an impact diff by querying related record counts for both
   * source and target, then updates the status to READY.
   */
  router.post("/previews", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = CreateMergePreviewSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    const { sourceType, sourceId, targetType, targetId } = parse.data;

    try {
      // Create the preview in COMPUTING state
      const preview = await prisma.mergePreview.create({
        data: {
          organizationId,
          sourceType,
          sourceId,
          targetType,
          targetId,
          status: "COMPUTING",
          impactDiff: {},
          createdById: userId,
        },
      });

      // Compute impact diff by querying related records for source and target
      const [sourceStories, sourceCalls, targetStories, targetCalls] =
        await Promise.all([
          prisma.story.count({
            where: { accountId: sourceId, organizationId },
          }),
          prisma.call.count({
            where: { accountId: sourceId, organizationId },
          }),
          prisma.story.count({
            where: { accountId: targetId, organizationId },
          }),
          prisma.call.count({
            where: { accountId: targetId, organizationId },
          }),
        ]);

      const impactDiff = {
        source: {
          type: sourceType,
          id: sourceId,
          stories: sourceStories,
          calls: sourceCalls,
        },
        target: {
          type: targetType,
          id: targetId,
          stories: targetStories,
          calls: targetCalls,
        },
      };

      // Update to READY with computed diff
      const updatedPreview = await prisma.mergePreview.update({
        where: { id: preview.id },
        data: {
          status: "READY",
          impactDiff,
        },
      });

      res.status(201).json(updatedPreview);
    } catch (err) {
      console.error("Create merge preview error:", err);
      res.status(500).json({ error: "Failed to create merge preview" });
    }
  });

  /**
   * GET /previews/:previewId
   *
   * Returns a specific merge preview by ID.
   */
  router.get("/previews/:previewId", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const preview = await prisma.mergePreview.findFirst({
        where: {
          id: req.params.previewId as string,
          organizationId,
        },
      });

      if (!preview) {
        res.status(404).json({ error: "Merge preview not found" });
        return;
      }

      res.json(preview);
    } catch (err) {
      console.error("Get merge preview error:", err);
      res.status(500).json({ error: "Failed to get merge preview" });
    }
  });

  /**
   * POST /previews/:previewId/apply
   *
   * Applies a merge preview. Admin only (OWNER or ADMIN role required).
   * Updates the preview status to APPLIED and records the applied timestamp.
   */
  router.post("/previews/:previewId/apply", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userRole = (req as any).userRole as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!["OWNER", "ADMIN"].includes(userRole)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    try {
      const preview = await prisma.mergePreview.findFirst({
        where: {
          id: req.params.previewId as string,
          organizationId,
        },
      });

      if (!preview) {
        res.status(404).json({ error: "Merge preview not found" });
        return;
      }

      if (preview.status !== "READY") {
        res.status(400).json({
          error: "validation_error",
          message: `Cannot apply a preview with status "${preview.status}". Only READY previews can be applied.`,
        });
        return;
      }

      const updated = await prisma.mergePreview.update({
        where: { id: preview.id },
        data: {
          status: "APPLIED",
          appliedAt: new Date(),
        },
      });

      res.json(updated);
    } catch (err) {
      console.error("Apply merge preview error:", err);
      res.status(500).json({ error: "Failed to apply merge preview" });
    }
  });

  /**
   * POST /previews/:previewId/discard
   *
   * Discards a merge preview by updating its status to DISCARDED.
   */
  router.post("/previews/:previewId/discard", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const preview = await prisma.mergePreview.findFirst({
        where: {
          id: req.params.previewId as string,
          organizationId,
        },
      });

      if (!preview) {
        res.status(404).json({ error: "Merge preview not found" });
        return;
      }

      if (preview.status === "APPLIED" || preview.status === "DISCARDED") {
        res.status(400).json({
          error: "validation_error",
          message: `Cannot discard a preview with status "${preview.status}".`,
        });
        return;
      }

      const updated = await prisma.mergePreview.update({
        where: { id: preview.id },
        data: {
          status: "DISCARDED",
        },
      });

      res.json(updated);
    } catch (err) {
      console.error("Discard merge preview error:", err);
      res.status(500).json({ error: "Failed to discard merge preview" });
    }
  });

  // ── Shared Assets ───────────────────────────────────────────────────

  /**
   * GET /assets
   *
   * Lists shared assets for the current organization.
   * Supports filtering by assetType and pagination via limit/offset.
   */
  router.get("/assets", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = ListAssetsQuerySchema.safeParse(req.query);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    const { assetType, limit = 25, offset = 0 } = parse.data;

    try {
      const where: Record<string, unknown> = { organizationId };
      if (assetType) {
        where.assetType = assetType;
      }

      const [assets, total] = await Promise.all([
        prisma.sharedAsset.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.sharedAsset.count({ where }),
      ]);

      res.json({ assets, total, limit, offset });
    } catch (err) {
      console.error("List shared assets error:", err);
      res.status(500).json({ error: "Failed to list shared assets" });
    }
  });

  /**
   * POST /assets
   *
   * Creates a new shared asset for the current organization.
   */
  router.post("/assets", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = CreateSharedAssetSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    const {
      assetType,
      name,
      description,
      storageUrl,
      mimeType,
      fileSizeBytes,
      thumbnailUrl,
      tags,
    } = parse.data;

    try {
      const asset = await prisma.sharedAsset.create({
        data: {
          organizationId,
          assetType,
          name,
          description: description ?? null,
          storageUrl,
          mimeType,
          fileSizeBytes,
          thumbnailUrl: thumbnailUrl ?? null,
          tags: tags ?? [],
          uploadedById: userId,
        },
      });

      res.status(201).json(asset);
    } catch (err) {
      console.error("Create shared asset error:", err);
      res.status(500).json({ error: "Failed to create shared asset" });
    }
  });

  /**
   * PATCH /assets/:assetId
   *
   * Updates an existing shared asset.
   */
  router.patch("/assets/:assetId", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = UpdateSharedAssetSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const existing = await prisma.sharedAsset.findFirst({
        where: {
          id: req.params.assetId as string,
          organizationId,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Shared asset not found" });
        return;
      }

      const updated = await prisma.sharedAsset.update({
        where: { id: existing.id },
        data: parse.data,
      });

      res.json(updated);
    } catch (err) {
      console.error("Update shared asset error:", err);
      res.status(500).json({ error: "Failed to update shared asset" });
    }
  });

  /**
   * DELETE /assets/:assetId
   *
   * Deletes a shared asset. Admin only (OWNER or ADMIN role required).
   */
  router.delete("/assets/:assetId", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userRole = (req as any).userRole as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!["OWNER", "ADMIN"].includes(userRole)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    try {
      const existing = await prisma.sharedAsset.findFirst({
        where: {
          id: req.params.assetId as string,
          organizationId,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Shared asset not found" });
        return;
      }

      await prisma.sharedAsset.delete({
        where: { id: existing.id },
      });

      res.json({ deleted: true, id: existing.id });
    } catch (err) {
      console.error("Delete shared asset error:", err);
      res.status(500).json({ error: "Failed to delete shared asset" });
    }
  });

  return router;
}
