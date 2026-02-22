/**
 * Integration Health API Routes
 *
 * Provides endpoints for integration reliability monitoring:
 *   GET    /health                — Health summary for all integrations
 *   GET    /runs                  — List integration runs (with filters)
 *   GET    /runs/:runId           — Get specific run details
 *   GET    /dlq                   — List dead letter queue entries (with filters)
 *   POST   /dlq/:entryId/replay  — Replay a single DLQ entry
 *   POST   /dlq/replay-all       — Replay all pending DLQ entries for org
 *   DELETE /dlq/:entryId         — Discard a DLQ entry
 *   POST   /backfill             — Start a backfill (admin only)
 */

import { Router, type Request, type Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { IntegrationReliabilityService } from "../services/integration-reliability.js";

// ─── Validation Schemas ─────────────────────────────────────────────────────

const runsQuerySchema = z.object({
  provider: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const dlqQuerySchema = z.object({
  status: z.string().optional(),
  provider: z.string().optional(),
});

const backfillBodySchema = z.object({
  provider: z.string().min(1),
  since: z.coerce.date(),
});

// ─── Route Factory ──────────────────────────────────────────────────────────

export function createIntegrationHealthRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new IntegrationReliabilityService(prisma);

  // ── GET /health — Health summary for all integrations ───────────────
  router.get("/health", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;

      const summary = await service.getHealthSummary(organizationId);

      res.json({ summary });
    } catch (err) {
      res.status(500).json({
        error: "Failed to fetch health summary",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ── GET /runs — List integration runs ───────────────────────────────
  router.get("/runs", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;

      const parsed = runsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid query parameters", details: parsed.error.issues });
        return;
      }

      const { provider, status, limit, offset } = parsed.data;

      const runs = await service.getRunHistory(organizationId, {
        provider,
        status,
        limit: limit ?? 50,
      });

      // Apply offset manually since the service doesn't support it natively
      const effectiveOffset = offset ?? 0;
      const sliced = runs.slice(effectiveOffset);

      res.json({ runs: sliced, total: runs.length, offset: effectiveOffset });
    } catch (err) {
      res.status(500).json({
        error: "Failed to fetch integration runs",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ── GET /runs/:runId — Get specific run details ─────────────────────
  router.get("/runs/:runId", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const runId = req.params.runId as string;

      const runs = await service.getRunHistory(organizationId, { limit: 1000 });
      const run = runs.find((r) => r.id === runId);

      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }

      res.json({ run });
    } catch (err) {
      res.status(500).json({
        error: "Failed to fetch run details",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ── GET /dlq — List dead letter queue entries ───────────────────────
  router.get("/dlq", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;

      const parsed = dlqQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid query parameters", details: parsed.error.issues });
        return;
      }

      const { status, provider } = parsed.data;

      const entries = await service.getDlqEntries(organizationId, {
        status,
        provider,
      });

      res.json({ entries, total: entries.length });
    } catch (err) {
      res.status(500).json({
        error: "Failed to fetch DLQ entries",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ── POST /dlq/:entryId/replay — Replay a single DLQ entry ──────────
  router.post("/dlq/:entryId/replay", async (req: Request, res: Response) => {
    try {
      const entryId = req.params.entryId as string;

      const result = await service.replayDlqEntry(entryId);

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json({ success: true, message: "DLQ entry queued for replay" });
    } catch (err) {
      res.status(500).json({
        error: "Failed to replay DLQ entry",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ── POST /dlq/replay-all — Replay all pending DLQ entries ──────────
  router.post("/dlq/replay-all", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;

      const result = await service.replayAllDlq(organizationId);

      res.json({ success: true, replayed: result.replayed });
    } catch (err) {
      res.status(500).json({
        error: "Failed to replay DLQ entries",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ── DELETE /dlq/:entryId — Discard a DLQ entry ─────────────────────
  router.delete("/dlq/:entryId", async (req: Request, res: Response) => {
    try {
      const entryId = req.params.entryId as string;

      await service.discardDlqEntry(entryId);

      res.json({ success: true, message: "DLQ entry discarded" });
    } catch (err) {
      res.status(500).json({
        error: "Failed to discard DLQ entry",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ── POST /backfill — Start a backfill (admin only) ─────────────────
  router.post("/backfill", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const userRole = (req as any).userRole as string | undefined;

      if (!userRole || !["OWNER", "ADMIN"].includes(userRole)) {
        res.status(403).json({ error: "Insufficient permissions. Admin role required." });
        return;
      }

      const parsed = backfillBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
        return;
      }

      const { provider, since } = parsed.data;

      const run = await service.startBackfill({
        organizationId,
        provider,
        startDate: since,
      });

      res.status(201).json({ run });
    } catch (err) {
      res.status(500).json({
        error: "Failed to start backfill",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  return router;
}
