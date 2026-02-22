import { Router, type Request, type Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { EnvironmentConfigService } from "../services/environment-config.js";

export function createEnvironmentRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const envService = new EnvironmentConfigService(prisma);

  // GET /info — Environment info (non-sensitive)
  router.get("/info", (_req: Request, res: Response) => {
    try {
      const info = envService.getEnvironmentInfo();
      res.json({ environment: info });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // POST /deploy-check — Validate deploy readiness
  router.post("/deploy-check", async (req: Request, res: Response) => {
    try {
      const userRole = (req as any).userRole as string;
      if (!["OWNER", "ADMIN"].includes(userRole)) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }
      const organizationId = (req as any).organizationId as string;
      const readiness = await envService.checkDeployReadiness(organizationId);
      res.json({ readiness });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /config-drift — Check for configuration drift
  router.get("/config-drift", (req: Request, res: Response) => {
    try {
      const userRole = (req as any).userRole as string;
      if (!["OWNER", "ADMIN"].includes(userRole)) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }
      const drifts = envService.detectConfigDrift();
      res.json({
        drifts,
        hasCriticalDrift: drifts.some((d) => d.severity === "high"),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  return router;
}
