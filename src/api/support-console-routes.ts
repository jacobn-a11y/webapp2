/**
 * Internal Support / Admin Console Routes
 *
 * Provides endpoints for internal support tooling:
 *   - Org overview and diagnostics
 *   - User lookup and impersonation context
 *   - Feature flag management
 *   - Health score overview
 */

import { Router, type Request, type Response } from "express";
import type { PrismaClient } from "@prisma/client";

export function createSupportConsoleRoutes(prisma: PrismaClient): Router {
  const router = Router();

  // GET /org-overview — Full org diagnostic view
  router.get("/org-overview", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;

      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          plan: true,
          pricingModel: true,
          billingChannel: true,
          seatLimit: true,
          trialEndsAt: true,
          contractEndsAt: true,
          createdAt: true,
        },
      });

      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const [
        userCount,
        accountCount,
        storyCount,
        pageCount,
        callCount,
        integrationCount,
        featureFlagCount,
      ] = await Promise.all([
        prisma.user.count({ where: { organizationId } }),
        prisma.account.count({ where: { organizationId } }),
        prisma.story.count({ where: { organizationId } }),
        prisma.landingPage.count({ where: { organizationId } }),
        prisma.call.count({ where: { organizationId } }),
        prisma.integrationConfig.count({ where: { organizationId, enabled: true } }),
        prisma.orgFeatureFlag.count({ where: { organizationId, enabled: true } }),
      ]);

      res.json({
        organization: org,
        counts: {
          users: userCount,
          accounts: accountCount,
          stories: storyCount,
          landingPages: pageCount,
          calls: callCount,
          integrations: integrationCount,
          featureFlags: featureFlagCount,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /users — List all users with their roles and access
  router.get("/users", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;

      const users = await prisma.user.findMany({
        where: { organizationId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          roleAssignment: {
            select: {
              roleProfile: { select: { key: true, name: true } },
            },
          },
          permissions: { select: { permission: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      res.json({
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          roleProfile: u.roleAssignment?.roleProfile ?? null,
          permissions: u.permissions.map((p) => p.permission),
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /feature-flags — List all feature flags with status
  router.get("/feature-flags", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;

      const flags = await prisma.orgFeatureFlag.findMany({
        where: { organizationId },
        orderBy: { key: "asc" },
      });

      res.json({ flags });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /recent-activity — Recent audit log activity
  router.get("/recent-activity", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const limit = Math.min(Number(req.query.limit) || 50, 200);

      const logs = await prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          actorUserId: true,
          category: true,
          action: true,
          targetType: true,
          targetId: true,
          severity: true,
          metadata: true,
          createdAt: true,
        },
      });

      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /integration-status — Integration diagnostic info
  router.get("/integration-status", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;

      const configs = await prisma.integrationConfig.findMany({
        where: { organizationId },
        select: {
          provider: true,
          enabled: true,
          lastSyncAt: true,
          createdAt: true,
        },
      });

      const recentRuns = await prisma.integrationRun.findMany({
        where: { organizationId },
        orderBy: { startedAt: "desc" },
        take: 20,
        select: {
          id: true,
          provider: true,
          status: true,
          itemsProcessed: true,
          itemsFailed: true,
          errorMessage: true,
          startedAt: true,
          completedAt: true,
        },
      });

      const dlqCount = await prisma.integrationDlqEntry.count({
        where: { organizationId, status: "PENDING" },
      });

      res.json({
        integrations: configs,
        recentRuns,
        pendingDlqEntries: dlqCount,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /onboarding-status — Current onboarding progress
  router.get("/onboarding-status", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;

      const steps = await prisma.onboardingProgress.findMany({
        where: { organizationId },
        orderBy: { sortOrder: "asc" },
      });

      const completedCount = steps.filter((s) => s.completed).length;

      res.json({
        steps,
        progress: {
          total: steps.length,
          completed: completedCount,
          percentage: steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  return router;
}
