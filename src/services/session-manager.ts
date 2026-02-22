/**
 * Session Manager — SSO, MFA, Session, and IP Allowlist Enforcement
 *
 * Manages:
 * - Session creation, validation, and revocation
 * - SSO enforcement toggle and domain mapping
 * - MFA policy enforcement for privileged actions
 * - IP allowlist enforcement
 * - Session controls (max age, re-auth, device tracking)
 */

import type { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import logger from "../lib/logger.js";

export interface SessionInfo {
  id: string;
  userId: string;
  organizationId: string;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string | null;
  mfaVerified: boolean;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

export interface SessionPolicyConfig {
  maxSessionDurationHours: number;
  idleTimeoutMinutes: number;
  mfaRequired: boolean;
  mfaRequiredForPrivilegedActions: boolean;
  ssoEnforced: boolean;
  ssoDomains: string[];
  maxConcurrentSessions: number;
  reAuthRequiredForSensitiveActions: boolean;
  reAuthWindowMinutes: number;
}

const DEFAULT_SESSION_POLICY: SessionPolicyConfig = {
  maxSessionDurationHours: 24,
  idleTimeoutMinutes: 60,
  mfaRequired: false,
  mfaRequiredForPrivilegedActions: false,
  ssoEnforced: false,
  ssoDomains: [],
  maxConcurrentSessions: 5,
  reAuthRequiredForSensitiveActions: false,
  reAuthWindowMinutes: 15,
};

export class SessionManager {
  constructor(private prisma: PrismaClient) {}

  // ─── Session Policy CRUD ─────────────────────────────────────────────

  async getSessionPolicy(organizationId: string): Promise<SessionPolicyConfig> {
    try {
      const policy = await (this.prisma as any).sessionPolicy?.findUnique?.({
        where: { organizationId },
      });
      if (!policy) return { ...DEFAULT_SESSION_POLICY };
      return {
        maxSessionDurationHours: policy.maxSessionDurationHours ?? DEFAULT_SESSION_POLICY.maxSessionDurationHours,
        idleTimeoutMinutes: policy.idleTimeoutMinutes ?? DEFAULT_SESSION_POLICY.idleTimeoutMinutes,
        mfaRequired: policy.mfaRequired ?? false,
        mfaRequiredForPrivilegedActions: policy.mfaRequiredForPrivilegedActions ?? false,
        ssoEnforced: policy.ssoEnforced ?? false,
        ssoDomains: policy.ssoDomains ?? [],
        maxConcurrentSessions: policy.maxConcurrentSessions ?? DEFAULT_SESSION_POLICY.maxConcurrentSessions,
        reAuthRequiredForSensitiveActions: policy.reAuthRequiredForSensitiveActions ?? false,
        reAuthWindowMinutes: policy.reAuthWindowMinutes ?? DEFAULT_SESSION_POLICY.reAuthWindowMinutes,
      };
    } catch {
      return { ...DEFAULT_SESSION_POLICY };
    }
  }

  async updateSessionPolicy(
    organizationId: string,
    updates: Partial<SessionPolicyConfig>
  ): Promise<SessionPolicyConfig> {
    const current = await this.getSessionPolicy(organizationId);
    const merged = { ...current, ...updates };

    await (this.prisma as any).sessionPolicy.upsert({
      where: { organizationId },
      create: { organizationId, ...merged },
      update: merged,
    });

    return merged;
  }

  // ─── Session Lifecycle ───────────────────────────────────────────────

  async createSession(params: {
    userId: string;
    organizationId: string;
    ipAddress: string;
    userAgent: string;
    deviceFingerprint?: string;
    mfaVerified?: boolean;
  }): Promise<SessionInfo> {
    const policy = await this.getSessionPolicy(params.organizationId);

    // Enforce max concurrent sessions
    const activeSessions = await (this.prisma as any).userSession.count({
      where: {
        userId: params.userId,
        organizationId: params.organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (activeSessions >= policy.maxConcurrentSessions) {
      // Revoke oldest session
      const oldest = await (this.prisma as any).userSession.findFirst({
        where: {
          userId: params.userId,
          organizationId: params.organizationId,
          revokedAt: null,
        },
        orderBy: { createdAt: "asc" },
      });
      if (oldest) {
        await this.revokeSession(oldest.id);
      }
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + policy.maxSessionDurationHours);

    const session = await (this.prisma as any).userSession.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId,
        sessionToken: crypto.randomBytes(32).toString("hex"),
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        deviceFingerprint: params.deviceFingerprint ?? null,
        mfaVerified: params.mfaVerified ?? false,
        expiresAt,
        lastActiveAt: new Date(),
      },
    });

    logger.info("Session created", {
      sessionId: session.id,
      userId: params.userId,
      orgId: params.organizationId,
    });

    return {
      id: session.id,
      userId: session.userId,
      organizationId: session.organizationId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceFingerprint: session.deviceFingerprint,
      mfaVerified: session.mfaVerified,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
    };
  }

  async validateSession(sessionId: string): Promise<SessionInfo | null> {
    try {
      const session = await (this.prisma as any).userSession.findUnique({
        where: { id: sessionId },
      });

      if (!session || session.revokedAt) return null;
      if (session.expiresAt < new Date()) return null;

      // Check idle timeout
      const policy = await this.getSessionPolicy(session.organizationId);
      const idleLimit = new Date();
      idleLimit.setMinutes(idleLimit.getMinutes() - policy.idleTimeoutMinutes);
      if (session.lastActiveAt < idleLimit) return null;

      // Update last active
      await (this.prisma as any).userSession.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() },
      });

      return {
        id: session.id,
        userId: session.userId,
        organizationId: session.organizationId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        deviceFingerprint: session.deviceFingerprint,
        mfaVerified: session.mfaVerified,
        createdAt: session.createdAt,
        lastActiveAt: new Date(),
        expiresAt: session.expiresAt,
      };
    } catch {
      return null;
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    try {
      await (this.prisma as any).userSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
    } catch (err) {
      logger.error("Failed to revoke session", { sessionId, error: err });
    }
  }

  async revokeAllUserSessions(userId: string, organizationId: string): Promise<number> {
    const result = await (this.prisma as any).userSession.updateMany({
      where: {
        userId,
        organizationId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async listActiveSessions(organizationId: string, userId?: string): Promise<SessionInfo[]> {
    const sessions = await (this.prisma as any).userSession.findMany({
      where: {
        organizationId,
        ...(userId ? { userId } : {}),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: "desc" },
      take: 100,
    });

    return sessions.map((s: any) => ({
      id: s.id,
      userId: s.userId,
      organizationId: s.organizationId,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      deviceFingerprint: s.deviceFingerprint,
      mfaVerified: s.mfaVerified,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      expiresAt: s.expiresAt,
    }));
  }

  // ─── IP Allowlist ────────────────────────────────────────────────────

  async getIpAllowlist(organizationId: string): Promise<Array<{
    id: string;
    cidr: string;
    label: string;
    enabled: boolean;
  }>> {
    try {
      const entries = await (this.prisma as any).ipAllowlistEntry.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
      });
      return entries.map((e: any) => ({
        id: e.id,
        cidr: e.cidr,
        label: e.label ?? "",
        enabled: e.enabled,
      }));
    } catch {
      return [];
    }
  }

  async addIpAllowlistEntry(
    organizationId: string,
    cidr: string,
    label: string
  ): Promise<string> {
    const entry = await (this.prisma as any).ipAllowlistEntry.create({
      data: { organizationId, cidr, label, enabled: true },
    });
    return entry.id;
  }

  async removeIpAllowlistEntry(id: string): Promise<void> {
    await (this.prisma as any).ipAllowlistEntry.delete({ where: { id } });
  }

  async checkIpAllowed(organizationId: string, ipAddress: string): Promise<boolean> {
    const allowlist = await this.getIpAllowlist(organizationId);
    // If no allowlist entries exist, all IPs are allowed
    const enabledEntries = allowlist.filter((e) => e.enabled);
    if (enabledEntries.length === 0) return true;

    // Check if IP matches any CIDR
    for (const entry of enabledEntries) {
      if (this.ipMatchesCidr(ipAddress, entry.cidr)) return true;
    }

    return false;
  }

  private ipMatchesCidr(ip: string, cidr: string): boolean {
    // Simple CIDR matching for IPv4
    if (!cidr.includes("/")) {
      return ip === cidr;
    }

    const [network, prefixStr] = cidr.split("/");
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix)) return false;

    const ipNum = this.ipToNumber(ip);
    const networkNum = this.ipToNumber(network);
    if (ipNum === null || networkNum === null) return false;

    const mask = ~((1 << (32 - prefix)) - 1);
    return (ipNum & mask) === (networkNum & mask);
  }

  private ipToNumber(ip: string): number | null {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  // ─── SSO Enforcement ─────────────────────────────────────────────────

  async isSsoRequired(organizationId: string, userEmail: string): Promise<boolean> {
    const policy = await this.getSessionPolicy(organizationId);
    if (!policy.ssoEnforced) return false;
    if (policy.ssoDomains.length === 0) return true;

    const domain = userEmail.split("@")[1]?.toLowerCase();
    return policy.ssoDomains.includes(domain ?? "");
  }
}
