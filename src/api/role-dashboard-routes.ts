/**
 * Role-Specific Dashboard Routes
 *
 * Provides personalized dashboard views for different personas:
 * - RevOps: Pipeline metrics, integration health, data quality
 * - Marketing: Content metrics, story taxonomy breakdown, page performance
 * - Sales: Account stories, win/loss insights, competitive positioning
 * - Customer Success: Account health, renewal risks, engagement
 */

import { Router, type Request, type Response } from "express";
import type { PrismaClient } from "@prisma/client";

export function createRoleDashboardRoutes(prisma: PrismaClient): Router {
  const router = Router();

  // GET /revops — Revenue Operations dashboard
  router.get("/revops", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const [accountCount, storyCount, integrationCount, recentRuns] = await Promise.all([
        prisma.account.count({ where: { organizationId } }),
        prisma.story.count({ where: { organizationId } }),
        prisma.integrationConfig.count({ where: { organizationId, enabled: true } }),
        prisma.integrationRun.findMany({
          where: { organizationId },
          orderBy: { startedAt: "desc" },
          take: 10,
          select: { id: true, provider: true, status: true, itemsProcessed: true, itemsFailed: true, startedAt: true, completedAt: true },
        }),
      ]);
      res.json({
        dashboard: "revops",
        metrics: { accountCount, storyCount, integrationCount },
        recentIntegrationRuns: recentRuns,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /marketing — Marketing dashboard
  router.get("/marketing", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const [stories, publishedPages, draftPages, recentStories] = await Promise.all([
        prisma.story.count({ where: { organizationId } }),
        prisma.landingPage.count({ where: { organizationId, status: "PUBLISHED" } }),
        prisma.landingPage.count({ where: { organizationId, status: "DRAFT" } }),
        prisma.story.findMany({
          where: { organizationId },
          orderBy: { generatedAt: "desc" },
          take: 10,
          select: { id: true, title: true, storyType: true, funnelStages: true, generatedAt: true },
        }),
      ]);
      // Story type breakdown
      const storyTypeBreakdown = await prisma.story.groupBy({
        by: ["storyType"],
        where: { organizationId },
        _count: true,
        orderBy: { _count: { storyType: "desc" } },
      });
      res.json({
        dashboard: "marketing",
        metrics: { totalStories: stories, publishedPages, draftPages },
        storyTypeBreakdown: storyTypeBreakdown.map((s) => ({ type: s.storyType, count: s._count })),
        recentStories,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /sales — Sales dashboard
  router.get("/sales", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const userId = (req as any).userId as string;
      // Check if user has account-scoped access
      const accessGrants = await prisma.userAccountAccess.findMany({
        where: { userId, organizationId },
        select: { scopeType: true, accountId: true, cachedAccountIds: true },
      });
      let accountFilter: any = { organizationId };
      const grantedIds: string[] = [];
      for (const grant of accessGrants) {
        if (grant.scopeType === "ALL_ACCOUNTS") {
          grantedIds.length = 0; // No filter needed
          break;
        }
        if (grant.accountId) grantedIds.push(grant.accountId);
        grantedIds.push(...grant.cachedAccountIds);
      }
      if (grantedIds.length > 0) {
        accountFilter = { organizationId, id: { in: grantedIds } };
      }
      const [accounts, stories] = await Promise.all([
        prisma.account.findMany({
          where: accountFilter,
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: { id: true, name: true, industry: true, _count: { select: { stories: true, calls: true } } },
        }),
        prisma.story.count({ where: { organizationId, account: accountFilter } }),
      ]);
      res.json({
        dashboard: "sales",
        metrics: { accessibleAccounts: accounts.length, totalStories: stories },
        topAccounts: accounts.map((a) => ({
          id: a.id, name: a.name, industry: a.industry,
          storyCount: a._count.stories, callCount: a._count.calls,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  // GET /cs — Customer Success dashboard
  router.get("/cs", async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).organizationId as string;
      const [totalAccounts, accountsWithRecentCalls, recentStories, healthScore] = await Promise.all([
        prisma.account.count({ where: { organizationId } }),
        prisma.account.count({
          where: {
            organizationId,
            calls: { some: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } },
          },
        }),
        prisma.story.findMany({
          where: { organizationId, generatedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
          orderBy: { generatedAt: "desc" },
          take: 5,
          select: { id: true, title: true, storyType: true, account: { select: { name: true } }, generatedAt: true },
        }),
        prisma.orgHealthScore.findFirst({
          where: { organizationId },
          orderBy: { calculatedAt: "desc" },
        }),
      ]);
      res.json({
        dashboard: "cs",
        metrics: {
          totalAccounts,
          activeAccounts: accountsWithRecentCalls,
          engagementRate: totalAccounts > 0 ? (accountsWithRecentCalls / totalAccounts * 100).toFixed(1) : "0",
        },
        recentStories,
        healthScore: healthScore ? { score: healthScore.overallScore, dimensions: healthScore.dimensions, trend: healthScore.trend } : null,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });

  return router;
}
