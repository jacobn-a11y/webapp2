import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionManager } from "../../src/services/session-manager.js";

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    sessionPolicy: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    userSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    ipAllowlistEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      delete: vi.fn(),
    },
  } as any;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("SessionManager", () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let manager: SessionManager;

  beforeEach(() => {
    prisma = createMockPrisma();
    manager = new SessionManager(prisma);
  });

  // ─── createSession() ──────────────────────────────────────────────────

  describe("createSession() creates a session with correct fields", () => {
    it("creates a session with userId, orgId, ip, userAgent, and expiry", async () => {
      const now = new Date();
      const mockSession = {
        id: "session-1",
        userId: "user-1",
        organizationId: "org-1",
        sessionToken: "abc123",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        deviceFingerprint: null,
        mfaVerified: false,
        createdAt: now,
        lastActiveAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      };

      prisma.userSession.create.mockResolvedValue(mockSession);

      const session = await manager.createSession({
        userId: "user-1",
        organizationId: "org-1",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });

      expect(session.id).toBe("session-1");
      expect(session.userId).toBe("user-1");
      expect(session.organizationId).toBe("org-1");
      expect(session.ipAddress).toBe("192.168.1.1");
      expect(session.userAgent).toBe("Mozilla/5.0");
      expect(session.mfaVerified).toBe(false);
      expect(session.expiresAt).toBeDefined();
    });

    it("creates a session with mfaVerified set to true when provided", async () => {
      const now = new Date();
      const mockSession = {
        id: "session-2",
        userId: "user-1",
        organizationId: "org-1",
        sessionToken: "def456",
        ipAddress: "10.0.0.1",
        userAgent: "Chrome",
        deviceFingerprint: "fp-abc",
        mfaVerified: true,
        createdAt: now,
        lastActiveAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      };

      prisma.userSession.create.mockResolvedValue(mockSession);

      const session = await manager.createSession({
        userId: "user-1",
        organizationId: "org-1",
        ipAddress: "10.0.0.1",
        userAgent: "Chrome",
        deviceFingerprint: "fp-abc",
        mfaVerified: true,
      });

      expect(session.mfaVerified).toBe(true);
      expect(session.deviceFingerprint).toBe("fp-abc");
    });

    it("revokes oldest session when concurrent session limit is reached", async () => {
      prisma.userSession.count.mockResolvedValue(5); // At limit (default is 5)
      prisma.userSession.findFirst.mockResolvedValue({ id: "oldest-session" });
      prisma.userSession.update.mockResolvedValue({});

      const now = new Date();
      prisma.userSession.create.mockResolvedValue({
        id: "session-new",
        userId: "user-1",
        organizationId: "org-1",
        sessionToken: "token",
        ipAddress: "1.1.1.1",
        userAgent: "UA",
        deviceFingerprint: null,
        mfaVerified: false,
        createdAt: now,
        lastActiveAt: now,
        expiresAt: new Date(now.getTime() + 86400000),
      });

      await manager.createSession({
        userId: "user-1",
        organizationId: "org-1",
        ipAddress: "1.1.1.1",
        userAgent: "UA",
      });

      // Should have revoked the oldest session
      expect(prisma.userSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "oldest-session" },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        })
      );
    });
  });

  // ─── validateSession() — valid session ─────────────────────────────────

  describe("validateSession() returns valid for unexpired sessions", () => {
    it("returns session info for a valid, active session", async () => {
      const now = new Date();
      const mockSession = {
        id: "session-valid",
        userId: "user-1",
        organizationId: "org-1",
        ipAddress: "192.168.1.1",
        userAgent: "Chrome",
        deviceFingerprint: null,
        mfaVerified: false,
        createdAt: new Date(now.getTime() - 60_000),
        lastActiveAt: new Date(now.getTime() - 30_000), // 30s ago (well within idle timeout)
        expiresAt: new Date(now.getTime() + 86400000), // expires tomorrow
        revokedAt: null,
      };

      prisma.userSession.findUnique.mockResolvedValue(mockSession);
      prisma.userSession.update.mockResolvedValue(mockSession);

      const result = await manager.validateSession("session-valid");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("session-valid");
      expect(result!.userId).toBe("user-1");
    });

    it("updates lastActiveAt on successful validation", async () => {
      const now = new Date();
      const mockSession = {
        id: "session-touch",
        userId: "user-1",
        organizationId: "org-1",
        ipAddress: "10.0.0.1",
        userAgent: "Firefox",
        deviceFingerprint: null,
        mfaVerified: false,
        createdAt: now,
        lastActiveAt: new Date(now.getTime() - 5_000),
        expiresAt: new Date(now.getTime() + 86400000),
        revokedAt: null,
      };

      prisma.userSession.findUnique.mockResolvedValue(mockSession);
      prisma.userSession.update.mockResolvedValue(mockSession);

      await manager.validateSession("session-touch");

      expect(prisma.userSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-touch" },
          data: { lastActiveAt: expect.any(Date) },
        })
      );
    });
  });

  // ─── validateSession() — expired session ──────────────────────────────

  describe("validateSession() returns invalid for expired sessions", () => {
    it("returns null for a session past its expiresAt", async () => {
      const mockSession = {
        id: "session-expired",
        userId: "user-1",
        organizationId: "org-1",
        ipAddress: "192.168.1.1",
        userAgent: "Chrome",
        deviceFingerprint: null,
        mfaVerified: false,
        createdAt: new Date("2024-01-01"),
        lastActiveAt: new Date("2024-01-01"),
        expiresAt: new Date("2024-01-02"), // already expired
        revokedAt: null,
      };

      prisma.userSession.findUnique.mockResolvedValue(mockSession);

      const result = await manager.validateSession("session-expired");
      expect(result).toBeNull();
    });

    it("returns null for a revoked session", async () => {
      const now = new Date();
      const mockSession = {
        id: "session-revoked",
        userId: "user-1",
        organizationId: "org-1",
        ipAddress: "192.168.1.1",
        userAgent: "Chrome",
        deviceFingerprint: null,
        mfaVerified: false,
        createdAt: now,
        lastActiveAt: now,
        expiresAt: new Date(now.getTime() + 86400000),
        revokedAt: new Date(), // revoked
      };

      prisma.userSession.findUnique.mockResolvedValue(mockSession);

      const result = await manager.validateSession("session-revoked");
      expect(result).toBeNull();
    });

    it("returns null for a session not found", async () => {
      prisma.userSession.findUnique.mockResolvedValue(null);

      const result = await manager.validateSession("nonexistent");
      expect(result).toBeNull();
    });

    it("returns null when session exceeds idle timeout", async () => {
      const now = new Date();
      const mockSession = {
        id: "session-idle",
        userId: "user-1",
        organizationId: "org-1",
        ipAddress: "192.168.1.1",
        userAgent: "Chrome",
        deviceFingerprint: null,
        mfaVerified: false,
        createdAt: new Date(now.getTime() - 7200000), // 2 hours ago
        lastActiveAt: new Date(now.getTime() - 7200000), // last active 2h ago (exceeds 60min idle)
        expiresAt: new Date(now.getTime() + 86400000),
        revokedAt: null,
      };

      prisma.userSession.findUnique.mockResolvedValue(mockSession);

      const result = await manager.validateSession("session-idle");
      expect(result).toBeNull();
    });
  });

  // ─── revokeSession() ──────────────────────────────────────────────────

  describe("revokeSession() sets revokedAt timestamp", () => {
    it("updates the session with a revokedAt timestamp", async () => {
      prisma.userSession.update.mockResolvedValue({});

      await manager.revokeSession("session-to-revoke");

      expect(prisma.userSession.update).toHaveBeenCalledWith({
        where: { id: "session-to-revoke" },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("does not throw when session does not exist", async () => {
      prisma.userSession.update.mockRejectedValue(new Error("Not found"));

      // Should not throw — error is caught internally
      await expect(manager.revokeSession("nonexistent")).resolves.toBeUndefined();
    });
  });

  // ─── checkIpAllowed() — no allowlist ──────────────────────────────────

  describe("isIpAllowed returns true when IP allowlist is disabled", () => {
    it("returns true when no allowlist entries exist", async () => {
      prisma.ipAllowlistEntry.findMany.mockResolvedValue([]);

      const allowed = await manager.checkIpAllowed("org-1", "1.2.3.4");
      expect(allowed).toBe(true);
    });

    it("returns true when all entries are disabled", async () => {
      prisma.ipAllowlistEntry.findMany.mockResolvedValue([
        { id: "entry-1", cidr: "10.0.0.0/8", label: "Office", enabled: false },
        { id: "entry-2", cidr: "192.168.0.0/16", label: "VPN", enabled: false },
      ]);

      const allowed = await manager.checkIpAllowed("org-1", "1.2.3.4");
      expect(allowed).toBe(true);
    });
  });

  // ─── checkIpAllowed() — CIDR matching ─────────────────────────────────

  describe("isIpAllowed correctly matches CIDR ranges", () => {
    it("allows an IP within a /24 CIDR range", async () => {
      prisma.ipAllowlistEntry.findMany.mockResolvedValue([
        { id: "entry-1", cidr: "10.0.1.0/24", label: "Office", enabled: true },
      ]);

      const allowed = await manager.checkIpAllowed("org-1", "10.0.1.42");
      expect(allowed).toBe(true);
    });

    it("denies an IP outside a /24 CIDR range", async () => {
      prisma.ipAllowlistEntry.findMany.mockResolvedValue([
        { id: "entry-1", cidr: "10.0.1.0/24", label: "Office", enabled: true },
      ]);

      const allowed = await manager.checkIpAllowed("org-1", "10.0.2.1");
      expect(allowed).toBe(false);
    });

    it("allows an exact IP match (no prefix)", async () => {
      prisma.ipAllowlistEntry.findMany.mockResolvedValue([
        { id: "entry-1", cidr: "203.0.113.45", label: "Dev Machine", enabled: true },
      ]);

      const allowed = await manager.checkIpAllowed("org-1", "203.0.113.45");
      expect(allowed).toBe(true);
    });

    it("denies a different IP when exact match is configured", async () => {
      prisma.ipAllowlistEntry.findMany.mockResolvedValue([
        { id: "entry-1", cidr: "203.0.113.45", label: "Dev Machine", enabled: true },
      ]);

      const allowed = await manager.checkIpAllowed("org-1", "203.0.113.46");
      expect(allowed).toBe(false);
    });

    it("allows IP within a broad /8 CIDR range", async () => {
      prisma.ipAllowlistEntry.findMany.mockResolvedValue([
        { id: "entry-1", cidr: "10.0.0.0/8", label: "Internal", enabled: true },
      ]);

      const allowed = await manager.checkIpAllowed("org-1", "10.255.255.254");
      expect(allowed).toBe(true);
    });

    it("matches against multiple allowlist entries", async () => {
      prisma.ipAllowlistEntry.findMany.mockResolvedValue([
        { id: "entry-1", cidr: "10.0.1.0/24", label: "Office A", enabled: true },
        { id: "entry-2", cidr: "172.16.0.0/16", label: "Office B", enabled: true },
      ]);

      const allowed = await manager.checkIpAllowed("org-1", "172.16.5.10");
      expect(allowed).toBe(true);
    });
  });
});
