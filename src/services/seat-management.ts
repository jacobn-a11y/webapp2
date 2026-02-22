/**
 * Seat Management & Usage Metering Service
 *
 * Manages seat limits, usage tracking, and entitlement checks.
 */

import type { PrismaClient } from "@prisma/client";

export interface SeatUsage {
  seatLimit: number | null;
  seatsUsed: number;
  seatsAvailable: number | null;
  overLimit: boolean;
}

export interface UsageSummary {
  storiesGenerated: number;
  pagesPublished: number;
  callsProcessed: number;
  aiTokensUsed: number;
  apiCallsMade: number;
}

export interface Entitlement {
  feature: string;
  entitled: boolean;
  limit: number | null;
  used: number;
}

export class SeatManagementService {
  constructor(private prisma: PrismaClient) {}

  async getSeatUsage(orgId: string): Promise<SeatUsage> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { seatLimit: true },
    });
    const seatsUsed = await this.prisma.user.count({ where: { organizationId: orgId } });
    return {
      seatLimit: org.seatLimit,
      seatsUsed,
      seatsAvailable: org.seatLimit ? org.seatLimit - seatsUsed : null,
      overLimit: org.seatLimit !== null && seatsUsed > org.seatLimit,
    };
  }

  async canAddSeat(orgId: string): Promise<boolean> {
    const usage = await this.getSeatUsage(orgId);
    return usage.seatLimit === null || usage.seatsUsed < usage.seatLimit;
  }

  async getUsageSummary(orgId: string, startDate: Date, endDate: Date): Promise<UsageSummary> {
    const dateRange = { gte: startDate, lte: endDate };
    const [stories, pages, calls, aiUsage, apiCalls] = await Promise.all([
      this.prisma.story.count({ where: { organizationId: orgId, generatedAt: dateRange } }),
      this.prisma.landingPage.count({ where: { organizationId: orgId, createdAt: dateRange, status: "PUBLISHED" } }),
      this.prisma.call.count({ where: { organizationId: orgId, createdAt: dateRange } }),
      this.prisma.aIUsageRecord.aggregate({ where: { organizationId: orgId, createdAt: dateRange }, _sum: { totalTokens: true } }),
      this.prisma.apiKey.count({ where: { organizationId: orgId } }),
    ]);
    return {
      storiesGenerated: stories,
      pagesPublished: pages,
      callsProcessed: calls,
      aiTokensUsed: aiUsage._sum.totalTokens ?? 0,
      apiCallsMade: apiCalls,
    };
  }

  async getEntitlements(orgId: string): Promise<Entitlement[]> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { plan: true, seatLimit: true },
    });
    const flags = await this.prisma.orgFeatureFlag.findMany({
      where: { organizationId: orgId },
      select: { key: true, enabled: true },
    });
    const flagMap = new Map(flags.map((f) => [f.key, f.enabled]));
    const seatsUsed = await this.prisma.user.count({ where: { organizationId: orgId } });

    const entitlements: Entitlement[] = [
      { feature: "seats", entitled: true, limit: org.seatLimit, used: seatsUsed },
      { feature: "story_generation", entitled: true, limit: null, used: 0 },
      { feature: "landing_pages", entitled: true, limit: null, used: 0 },
      { feature: "scim_provisioning", entitled: flagMap.get("scim_enabled") ?? false, limit: null, used: 0 },
      { feature: "custom_branding", entitled: flagMap.get("custom_branding") ?? false, limit: null, used: 0 },
      { feature: "audit_logs", entitled: true, limit: null, used: 0 },
      { feature: "crm_writeback", entitled: flagMap.get("crm_writeback") ?? false, limit: null, used: 0 },
      { feature: "workflow_automation", entitled: flagMap.get("workflow_automation") ?? false, limit: null, used: 0 },
      { feature: "data_governance", entitled: org.plan !== "FREE_TRIAL", limit: null, used: 0 },
      { feature: "api_access", entitled: true, limit: null, used: 0 },
    ];
    return entitlements;
  }

  async updateSeatLimit(orgId: string, newLimit: number | null): Promise<void> {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { seatLimit: newLimit },
    });
  }
}
