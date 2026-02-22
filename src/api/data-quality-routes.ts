/**
 * Data Quality Monitoring API Routes
 *
 * Provides endpoints for:
 *   - Quality metrics recording and retrieval
 *   - Data lineage tracking and graph traversal
 *   - Saved views management (create, update, delete, list)
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient, Prisma } from "@prisma/client";
import logger from "../lib/logger.js";

// ─── Validation ──────────────────────────────────────────────────────────────

const RecordMetricSchema = z.object({
  metricName: z.string().min(1).max(200),
  dimension: z.string().min(1).max(200),
  dimensionId: z.string().min(1),
  score: z.number().min(0).max(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

const RecordLineageSchema = z.object({
  targetType: z.string().min(1).max(100),
  targetId: z.string().min(1),
  sourceType: z.string().min(1).max(100),
  sourceId: z.string().min(1),
  relationship: z.string().min(1).max(200),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const CreateSavedViewSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  viewType: z.string().min(1).max(100),
  filtersJson: z.record(z.string(), z.unknown()).optional(),
  columnsJson: z.array(z.string()).optional(),
  sortJson: z.record(z.string(), z.unknown()).optional(),
  isShared: z.boolean().optional(),
});

const UpdateSavedViewSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  viewType: z.string().min(1).max(100).optional(),
  filtersJson: z.record(z.string(), z.unknown()).optional(),
  columnsJson: z.array(z.string()).optional(),
  sortJson: z.record(z.string(), z.unknown()).optional(),
  isShared: z.boolean().optional(),
});

// ─── Route Factory ───────────────────────────────────────────────────────────

export function createDataQualityRoutes(prisma: PrismaClient): Router {
  const router = Router();

  // ── Quality Metrics ─────────────────────────────────────────────────

  /**
   * GET /metrics
   *
   * Lists quality metrics for the organization.
   * Query params: metricName, dimension, limit
   */
  router.get("/metrics", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const metricName = (req.query.metricName as string | undefined)?.trim();
      const dimension = (req.query.dimension as string | undefined)?.trim();
      const limitRaw = Number(req.query.limit ?? 100);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(500, Math.floor(limitRaw)))
        : 100;

      const metrics = await prisma.qualityMetric.findMany({
        where: {
          organizationId,
          ...(metricName ? { metricName } : {}),
          ...(dimension ? { dimension } : {}),
        },
        orderBy: { measuredAt: "desc" },
        take: limit,
      });

      res.json({ metrics });
    } catch (err) {
      logger.error("List quality metrics error", { error: err });
      res.status(500).json({ error: "Failed to load quality metrics" });
    }
  });

  /**
   * POST /metrics
   *
   * Records a new quality metric. Admin only.
   */
  router.post("/metrics", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userRole = (req as any).userRole as string | undefined;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!userRole || !["OWNER", "ADMIN"].includes(userRole)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const parse = RecordMetricSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const metric = await prisma.qualityMetric.create({
        data: {
          organizationId,
          metricName: parse.data.metricName,
          dimension: parse.data.dimension,
          dimensionId: parse.data.dimensionId,
          score: parse.data.score,
          details: (parse.data.details ?? {}) as Prisma.InputJsonValue,
          measuredAt: new Date(),
        },
      });

      res.status(201).json({ metric });
    } catch (err) {
      logger.error("Record quality metric error", { error: err });
      res.status(500).json({ error: "Failed to record quality metric" });
    }
  });

  /**
   * GET /metrics/summary
   *
   * Returns aggregated quality summary grouped by metricName with average score.
   */
  router.get("/metrics/summary", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const summary = await prisma.qualityMetric.groupBy({
        by: ["metricName"],
        where: { organizationId },
        _avg: { score: true },
        _count: true,
        _min: { measuredAt: true },
        _max: { measuredAt: true },
      });

      res.json({
        summary: summary.map((row) => ({
          metricName: row.metricName,
          averageScore: row._avg.score !== null
            ? Math.round(row._avg.score * 1000) / 1000
            : null,
          count: row._count,
          firstMeasuredAt: row._min.measuredAt,
          lastMeasuredAt: row._max.measuredAt,
        })),
      });
    } catch (err) {
      logger.error("Quality metrics summary error", { error: err });
      res.status(500).json({ error: "Failed to load quality metrics summary" });
    }
  });

  // ── Data Lineage ────────────────────────────────────────────────────

  /**
   * GET /lineage
   *
   * Returns all lineage records for a given target.
   * Query params: targetType, targetId
   */
  router.get("/lineage", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const targetType = (req.query.targetType as string | undefined)?.trim();
    const targetId = (req.query.targetId as string | undefined)?.trim();

    if (!targetType || !targetId) {
      res.status(400).json({ error: "targetType and targetId query params are required" });
      return;
    }

    try {
      const lineage = await prisma.dataLineage.findMany({
        where: {
          organizationId,
          targetType,
          targetId,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ lineage });
    } catch (err) {
      logger.error("Get lineage error", { error: err });
      res.status(500).json({ error: "Failed to load lineage records" });
    }
  });

  /**
   * POST /lineage
   *
   * Records a new data lineage relationship.
   */
  router.post("/lineage", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = RecordLineageSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const record = await prisma.dataLineage.create({
        data: {
          organizationId,
          targetType: parse.data.targetType,
          targetId: parse.data.targetId,
          sourceType: parse.data.sourceType,
          sourceId: parse.data.sourceId,
          relationship: parse.data.relationship,
          metadata: (parse.data.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      res.status(201).json({ lineage: record });
    } catch (err) {
      logger.error("Record lineage error", { error: err });
      res.status(500).json({ error: "Failed to record lineage" });
    }
  });

  /**
   * GET /lineage/graph
   *
   * Returns full lineage graph for an entity, finding records where
   * the entity appears as either a source or a target.
   * Query params: entityType, entityId
   */
  router.get("/lineage/graph", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const entityType = (req.query.entityType as string | undefined)?.trim();
    const entityId = (req.query.entityId as string | undefined)?.trim();

    if (!entityType || !entityId) {
      res.status(400).json({ error: "entityType and entityId query params are required" });
      return;
    }

    try {
      const [asTarget, asSource] = await Promise.all([
        prisma.dataLineage.findMany({
          where: {
            organizationId,
            targetType: entityType,
            targetId: entityId,
          },
        }),
        prisma.dataLineage.findMany({
          where: {
            organizationId,
            sourceType: entityType,
            sourceId: entityId,
          },
        }),
      ]);

      res.json({
        entity: { entityType, entityId },
        upstream: asTarget,
        downstream: asSource,
      });
    } catch (err) {
      logger.error("Get lineage graph error", { error: err });
      res.status(500).json({ error: "Failed to load lineage graph" });
    }
  });

  // ── Saved Views ─────────────────────────────────────────────────────

  /**
   * GET /views
   *
   * Lists saved views for the organization.
   * Query params: viewType
   */
  router.get("/views", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const viewType = (req.query.viewType as string | undefined)?.trim();

    try {
      const views = await prisma.savedView.findMany({
        where: {
          organizationId,
          ...(viewType ? { viewType } : {}),
          OR: [
            { createdById: userId },
            { isShared: true },
          ],
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ views });
    } catch (err) {
      logger.error("List saved views error", { error: err });
      res.status(500).json({ error: "Failed to load saved views" });
    }
  });

  /**
   * POST /views
   *
   * Creates a new saved view.
   */
  router.post("/views", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = CreateSavedViewSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const view = await prisma.savedView.create({
        data: {
          organizationId,
          name: parse.data.name,
          description: parse.data.description ?? null,
          viewType: parse.data.viewType,
          filtersJson: (parse.data.filtersJson ?? {}) as Prisma.InputJsonValue,
          columnsJson: (parse.data.columnsJson ?? []) as Prisma.InputJsonValue,
          sortJson: (parse.data.sortJson ?? {}) as Prisma.InputJsonValue,
          isDefault: false,
          isShared: parse.data.isShared ?? false,
          createdById: userId,
        },
      });

      res.status(201).json({ view });
    } catch (err) {
      logger.error("Create saved view error", { error: err });
      res.status(500).json({ error: "Failed to create saved view" });
    }
  });

  /**
   * PATCH /views/:viewId
   *
   * Updates an existing saved view. Only the creator or an admin can update.
   */
  router.patch("/views/:viewId", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    const userRole = (req as any).userRole as string | undefined;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parse = UpdateSavedViewSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "validation_error", details: parse.error.issues });
      return;
    }

    try {
      const existing = await prisma.savedView.findFirst({
        where: {
          id: req.params.viewId as string,
          organizationId,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Saved view not found" });
        return;
      }

      const isAdmin = userRole && ["OWNER", "ADMIN"].includes(userRole);
      if (existing.createdById !== userId && !isAdmin) {
        res.status(403).json({ error: "You can only update your own views" });
        return;
      }

      const view = await prisma.savedView.update({
        where: { id: existing.id },
        data: {
          ...(parse.data.name !== undefined ? { name: parse.data.name } : {}),
          ...(parse.data.description !== undefined ? { description: parse.data.description } : {}),
          ...(parse.data.viewType !== undefined ? { viewType: parse.data.viewType } : {}),
          ...(parse.data.filtersJson !== undefined ? { filtersJson: parse.data.filtersJson as Prisma.InputJsonValue } : {}),
          ...(parse.data.columnsJson !== undefined ? { columnsJson: parse.data.columnsJson as Prisma.InputJsonValue } : {}),
          ...(parse.data.sortJson !== undefined ? { sortJson: parse.data.sortJson as Prisma.InputJsonValue } : {}),
          ...(parse.data.isShared !== undefined ? { isShared: parse.data.isShared } : {}),
        },
      });

      res.json({ view });
    } catch (err) {
      logger.error("Update saved view error", { error: err });
      res.status(500).json({ error: "Failed to update saved view" });
    }
  });

  /**
   * DELETE /views/:viewId
   *
   * Deletes a saved view. Only the creator or an admin can delete.
   */
  router.delete("/views/:viewId", async (req: Request, res: Response) => {
    const organizationId = (req as any).organizationId as string;
    const userId = (req as any).userId as string;
    const userRole = (req as any).userRole as string | undefined;
    if (!organizationId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const existing = await prisma.savedView.findFirst({
        where: {
          id: req.params.viewId as string,
          organizationId,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Saved view not found" });
        return;
      }

      const isAdmin = userRole && ["OWNER", "ADMIN"].includes(userRole);
      if (existing.createdById !== userId && !isAdmin) {
        res.status(403).json({ error: "You can only delete your own views" });
        return;
      }

      await prisma.savedView.delete({ where: { id: existing.id } });

      res.json({ deleted: true });
    } catch (err) {
      logger.error("Delete saved view error", { error: err });
      res.status(500).json({ error: "Failed to delete saved view" });
    }
  });

  return router;
}
