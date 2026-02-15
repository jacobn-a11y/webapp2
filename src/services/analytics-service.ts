/**
 * Analytics Service
 *
 * Aggregates org-wide metrics for the Analytics Dashboard:
 *   - Calls per week
 *   - Funnel stage distribution
 *   - Top 10 accounts by call volume
 *   - Entity resolution success rate over time
 *   - Most common taxonomy topics
 *   - High-value quote leaderboard
 *   - Landing page performance
 */

import type { PrismaClient } from "@prisma/client";
import { TOPIC_LABELS, type TaxonomyTopic } from "../types/taxonomy.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CallsPerWeek {
  week: string; // ISO week label, e.g. "2025-W03"
  count: number;
}

export interface FunnelStageDistribution {
  stage: string;
  count: number;
}

export interface AccountCallVolume {
  accountId: string;
  accountName: string;
  callCount: number;
}

export interface EntityResolutionRate {
  month: string; // e.g. "2025-01"
  totalCalls: number;
  resolvedCalls: number;
  rate: number; // 0.0–1.0
}

export interface TopicCount {
  topic: string;
  label: string;
  count: number;
}

export interface QuoteLeaderboardEntry {
  accountId: string;
  accountName: string;
  quoteCount: number;
}

export interface PagePerformance {
  id: string;
  title: string;
  slug: string;
  viewCount: number;
  publishedAt: Date | null;
}

export interface PageViewsOverTime {
  month: string;
  totalViews: number;
  pagesPublished: number;
}

export interface AnalyticsDashboardData {
  callsPerWeek: CallsPerWeek[];
  funnelDistribution: FunnelStageDistribution[];
  topAccountsByCallVolume: AccountCallVolume[];
  entityResolutionOverTime: EntityResolutionRate[];
  topTopics: TopicCount[];
  quoteLeaderboard: QuoteLeaderboardEntry[];
  topPagesByViews: PagePerformance[];
  pageViewsOverTime: PageViewsOverTime[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AnalyticsService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Fetches all analytics data for a given organization.
   */
  async getDashboardData(organizationId: string): Promise<AnalyticsDashboardData> {
    const [
      callsPerWeek,
      funnelDistribution,
      topAccountsByCallVolume,
      entityResolutionOverTime,
      topTopics,
      quoteLeaderboard,
      topPagesByViews,
      pageViewsOverTime,
    ] = await Promise.all([
      this.getCallsPerWeek(organizationId),
      this.getFunnelDistribution(organizationId),
      this.getTopAccountsByCallVolume(organizationId),
      this.getEntityResolutionOverTime(organizationId),
      this.getTopTopics(organizationId),
      this.getQuoteLeaderboard(organizationId),
      this.getTopPagesByViews(organizationId),
      this.getPageViewsOverTime(organizationId),
    ]);

    return {
      callsPerWeek,
      funnelDistribution,
      topAccountsByCallVolume,
      entityResolutionOverTime,
      topTopics,
      quoteLeaderboard,
      topPagesByViews,
      pageViewsOverTime,
    };
  }

  // ─── Calls Per Week (last 12 weeks) ──────────────────────────────

  private async getCallsPerWeek(organizationId: string): Promise<CallsPerWeek[]> {
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

    const calls = await this.prisma.call.findMany({
      where: {
        organizationId,
        occurredAt: { gte: twelveWeeksAgo },
      },
      select: { occurredAt: true },
      orderBy: { occurredAt: "asc" },
    });

    // Group by ISO week
    const weekMap = new Map<string, number>();

    // Pre-fill the last 12 weeks so we get zero-count weeks
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const label = getISOWeekLabel(d);
      if (!weekMap.has(label)) weekMap.set(label, 0);
    }

    for (const call of calls) {
      const label = getISOWeekLabel(call.occurredAt);
      weekMap.set(label, (weekMap.get(label) ?? 0) + 1);
    }

    return Array.from(weekMap.entries()).map(([week, count]) => ({ week, count }));
  }

  // ─── Funnel Stage Distribution ───────────────────────────────────

  private async getFunnelDistribution(
    organizationId: string
  ): Promise<FunnelStageDistribution[]> {
    // Get calls for this org, then group tags by funnel stage
    const tags = await this.prisma.callTag.groupBy({
      by: ["funnelStage"],
      where: {
        call: { organizationId },
      },
      _count: true,
    });

    return tags.map((t) => ({
      stage: t.funnelStage,
      count: t._count,
    }));
  }

  // ─── Top 10 Accounts by Call Volume ──────────────────────────────

  private async getTopAccountsByCallVolume(
    organizationId: string
  ): Promise<AccountCallVolume[]> {
    const grouped = await this.prisma.call.groupBy({
      by: ["accountId"],
      where: {
        organizationId,
        accountId: { not: null },
      },
      _count: true,
      orderBy: { _count: { accountId: "desc" } },
      take: 10,
    });

    // Hydrate account names
    const accountIds = grouped
      .map((g) => g.accountId)
      .filter((id): id is string => id !== null);

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(accounts.map((a) => [a.id, a.name]));

    return grouped
      .filter((g) => g.accountId !== null)
      .map((g) => ({
        accountId: g.accountId!,
        accountName: nameMap.get(g.accountId!) ?? "Unknown",
        callCount: g._count,
      }));
  }

  // ─── Entity Resolution Success Rate Over Time ────────────────────

  private async getEntityResolutionOverTime(
    organizationId: string
  ): Promise<EntityResolutionRate[]> {
    const calls = await this.prisma.call.findMany({
      where: { organizationId },
      select: { occurredAt: true, accountId: true },
      orderBy: { occurredAt: "asc" },
    });

    // Group by month
    const monthMap = new Map<string, { total: number; resolved: number }>();

    for (const call of calls) {
      const month = formatMonth(call.occurredAt);
      const entry = monthMap.get(month) ?? { total: 0, resolved: 0 };
      entry.total++;
      if (call.accountId) entry.resolved++;
      monthMap.set(month, entry);
    }

    return Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      totalCalls: data.total,
      resolvedCalls: data.resolved,
      rate: data.total > 0 ? Math.round((data.resolved / data.total) * 1000) / 1000 : 0,
    }));
  }

  // ─── Most Common Taxonomy Topics ─────────────────────────────────

  private async getTopTopics(organizationId: string): Promise<TopicCount[]> {
    const tags = await this.prisma.callTag.groupBy({
      by: ["topic"],
      where: {
        call: { organizationId },
      },
      _count: true,
      orderBy: { _count: { topic: "desc" } },
      take: 20,
    });

    return tags.map((t) => ({
      topic: t.topic,
      label: TOPIC_LABELS[t.topic as TaxonomyTopic] ?? t.topic,
      count: t._count,
    }));
  }

  // ─── High-Value Quote Leaderboard ────────────────────────────────

  private async getQuoteLeaderboard(
    organizationId: string
  ): Promise<QuoteLeaderboardEntry[]> {
    // Get quotes that have a metricValue (quantified-value quotes)
    const quotes = await this.prisma.highValueQuote.findMany({
      where: {
        metricValue: { not: null },
        story: { organizationId },
      },
      select: {
        story: {
          select: {
            accountId: true,
            account: { select: { name: true } },
          },
        },
      },
    });

    // Count by account
    const countMap = new Map<string, { name: string; count: number }>();
    for (const q of quotes) {
      const accountId = q.story.accountId;
      const entry = countMap.get(accountId) ?? {
        name: q.story.account.name,
        count: 0,
      };
      entry.count++;
      countMap.set(accountId, entry);
    }

    return Array.from(countMap.entries())
      .map(([accountId, data]) => ({
        accountId,
        accountName: data.name,
        quoteCount: data.count,
      }))
      .sort((a, b) => b.quoteCount - a.quoteCount)
      .slice(0, 15);
  }

  // ─── Landing Page Performance ────────────────────────────────────

  private async getTopPagesByViews(
    organizationId: string
  ): Promise<PagePerformance[]> {
    const pages = await this.prisma.landingPage.findMany({
      where: { organizationId },
      select: {
        id: true,
        title: true,
        slug: true,
        viewCount: true,
        publishedAt: true,
      },
      orderBy: { viewCount: "desc" },
      take: 10,
    });

    return pages;
  }

  private async getPageViewsOverTime(
    organizationId: string
  ): Promise<PageViewsOverTime[]> {
    const pages = await this.prisma.landingPage.findMany({
      where: {
        organizationId,
        publishedAt: { not: null },
      },
      select: { viewCount: true, publishedAt: true },
    });

    // Group by publication month
    const monthMap = new Map<string, { views: number; published: number }>();

    for (const page of pages) {
      if (!page.publishedAt) continue;
      const month = formatMonth(page.publishedAt);
      const entry = monthMap.get(month) ?? { views: 0, published: 0 };
      entry.views += page.viewCount;
      entry.published++;
      monthMap.set(month, entry);
    }

    return Array.from(monthMap.entries())
      .map(([month, data]) => ({
        month,
        totalViews: data.views,
        pagesPublished: data.published,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getISOWeekLabel(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Thursday in current week determines the year
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const year = d.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const weekNum = 1 + Math.round(
    ((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7
  );
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
