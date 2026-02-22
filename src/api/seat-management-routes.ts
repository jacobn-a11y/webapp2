import { Router, type Request, type Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { SeatManagementService } from "../services/seat-management.js";

export function createSeatManagementRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const seatService = new SeatManagementService(prisma);

  // GET /seats — Current seat usage
  router.get("/seats", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const usage = await seatService.getSeatUsage(organizationId);
      res.json({ usage });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /usage?start=ISO&end=ISO — Usage summary
  router.get("/usage", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const start = req.query.start ? new Date(String(req.query.start)) : new Date(Date.now() - 30 * 86400000);
      const end = req.query.end ? new Date(String(req.query.end)) : new Date();
      const summary = await seatService.getUsageSummary(organizationId, start, end);
      res.json({ summary });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /entitlements — Feature entitlements
  router.get("/entitlements", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const entitlements = await seatService.getEntitlements(organizationId);
      res.json({ entitlements });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // PUT /seats/limit — Update seat limit (admin only)
  router.put("/seats/limit", async (req: Request, res: Response) => {
    try {
      const userRole = (req as any).userRole as string;
      if (!["OWNER", "ADMIN"].includes(userRole)) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }
      const organizationId = (req as any).organizationId as string;
      const { limit } = req.body;
      if (limit !== null && (typeof limit !== "number" || limit < 1)) {
        res.status(400).json({ error: "Limit must be a positive number or null" });
        return;
      }
      await seatService.updateSeatLimit(organizationId, limit);
      const usage = await seatService.getSeatUsage(organizationId);
      res.json({ usage });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  return router;
}
