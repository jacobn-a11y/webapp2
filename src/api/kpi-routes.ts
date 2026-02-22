import { Router, type Request, type Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { KpiReportingService } from "../services/kpi-reporting.js";

export function createKpiRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const kpi = new KpiReportingService(prisma);

  // GET /pipeline?start=ISO&end=ISO
  router.get("/pipeline", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const range = parseRange(req);
      const metrics = await kpi.getPipelineMetrics(organizationId, range);
      res.json({ metrics });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /content?start=ISO&end=ISO
  router.get("/content", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const range = parseRange(req);
      const metrics = await kpi.getContentMetrics(organizationId, range);
      res.json({ metrics });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /team?start=ISO&end=ISO
  router.get("/team", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const range = parseRange(req);
      const metrics = await kpi.getTeamMetrics(organizationId, range);
      res.json({ metrics });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /executive?start=ISO&end=ISO
  router.get("/executive", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const range = parseRange(req);
      const report = await kpi.generateExecutiveReport(organizationId, range);
      res.json({ report });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  return router;
}

function parseRange(req: Request) {
  const start = req.query.start ? new Date(String(req.query.start)) : new Date(Date.now() - 30 * 86400000);
  const end = req.query.end ? new Date(String(req.query.end)) : new Date();
  return { startDate: start, endDate: end };
}
