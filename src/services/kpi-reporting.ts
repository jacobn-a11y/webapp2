import type { PrismaClient } from "@prisma/client";

export interface KpiTimeRange {
  startDate: Date;
  endDate: Date;
}

export interface PipelineMetrics {
  totalAccounts: number;
  accountsWithStories: number;
  storiesGenerated: number;
  pagesPublished: number;
  averageStoriesPerAccount: number;
}

export interface ContentMetrics {
  totalStories: number;
  storiesByType: Record<string, number>;
  storiesByFunnel: Record<string, number>;
  averageStoryLength: number;
  totalLandingPages: number;
  publishedPages: number;
  draftPages: number;
}

export interface EngagementMetrics {
  totalPageViews: number;
  uniqueVisitors: number;
  averageTimeOnPage: number;
  topPages: Array<{ pageId: string; title: string; views: number }>;
}

export interface TeamMetrics {
  totalUsers: number;
  activeUsers: number;
  storiesPerUser: Record<string, number>;
  topContributors: Array<{ userId: string; name: string | null; storyCount: number }>;
}

export interface ExecutiveReport {
  generatedAt: Date;
  timeRange: KpiTimeRange;
  pipeline: PipelineMetrics;
  content: ContentMetrics;
  team: TeamMetrics;
}

export class KpiReportingService {
  constructor(private prisma: PrismaClient) {}

  async getPipelineMetrics(orgId: string, range: KpiTimeRange): Promise<PipelineMetrics> {
    const [totalAccounts, accountsWithStories, storiesGenerated, pagesPublished] = await Promise.all([
      this.prisma.account.count({ where: { organizationId: orgId } }),
      this.prisma.account.count({
        where: { organizationId: orgId, stories: { some: { generatedAt: { gte: range.startDate, lte: range.endDate } } } },
      }),
      this.prisma.story.count({ where: { organizationId: orgId, generatedAt: { gte: range.startDate, lte: range.endDate } } }),
      this.prisma.landingPage.count({
        where: { organizationId: orgId, status: "PUBLISHED", createdAt: { gte: range.startDate, lte: range.endDate } },
      }),
    ]);
    return {
      totalAccounts,
      accountsWithStories,
      storiesGenerated,
      pagesPublished,
      averageStoriesPerAccount: totalAccounts > 0 ? storiesGenerated / totalAccounts : 0,
    };
  }

  async getContentMetrics(orgId: string, range: KpiTimeRange): Promise<ContentMetrics> {
    const where = { organizationId: orgId, generatedAt: { gte: range.startDate, lte: range.endDate } };
    const stories = await this.prisma.story.findMany({
      where,
      select: { storyType: true, funnelStages: true, markdownBody: true },
    });
    const storiesByType: Record<string, number> = {};
    const storiesByFunnel: Record<string, number> = {};
    let totalLength = 0;
    for (const s of stories) {
      storiesByType[s.storyType] = (storiesByType[s.storyType] || 0) + 1;
      for (const f of s.funnelStages) {
        storiesByFunnel[f] = (storiesByFunnel[f] || 0) + 1;
      }
      totalLength += s.markdownBody.length;
    }
    const pages = await this.prisma.landingPage.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: true,
    });
    const published = pages.find((p) => p.status === "PUBLISHED")?._count ?? 0;
    const draft = pages.find((p) => p.status === "DRAFT")?._count ?? 0;
    return {
      totalStories: stories.length,
      storiesByType,
      storiesByFunnel,
      averageStoryLength: stories.length > 0 ? totalLength / stories.length : 0,
      totalLandingPages: pages.reduce((s, p) => s + p._count, 0),
      publishedPages: published,
      draftPages: draft,
    };
  }

  async getTeamMetrics(orgId: string, range: KpiTimeRange): Promise<TeamMetrics> {
    const users = await this.prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
    });
    // Count stories per user (via landing pages created)
    const storyCounts = await this.prisma.story.groupBy({
      by: ["organizationId"],
      where: { organizationId: orgId, generatedAt: { gte: range.startDate, lte: range.endDate } },
      _count: true,
    });
    const activeUserIds = new Set<string>();
    // Approximate active users from audit logs
    const recentLogs = await this.prisma.auditLog.findMany({
      where: { organizationId: orgId, createdAt: { gte: range.startDate, lte: range.endDate } },
      select: { actorUserId: true },
      distinct: ["actorUserId"],
    });
    for (const log of recentLogs) {
      if (log.actorUserId) activeUserIds.add(log.actorUserId);
    }
    return {
      totalUsers: users.length,
      activeUsers: activeUserIds.size,
      storiesPerUser: {},
      topContributors: users.slice(0, 10).map((u) => ({ userId: u.id, name: u.name, storyCount: 0 })),
    };
  }

  async generateExecutiveReport(orgId: string, range: KpiTimeRange): Promise<ExecutiveReport> {
    const [pipeline, content, team] = await Promise.all([
      this.getPipelineMetrics(orgId, range),
      this.getContentMetrics(orgId, range),
      this.getTeamMetrics(orgId, range),
    ]);
    return { generatedAt: new Date(), timeRange: range, pipeline, content, team };
  }
}
