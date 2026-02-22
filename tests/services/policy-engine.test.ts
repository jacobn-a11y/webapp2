import { describe, it, expect, vi, beforeEach } from "vitest";
import { PolicyEngine } from "../../src/services/policy-engine.js";
import type { PolicySubject, PolicyResource, PolicyContext } from "../../src/services/policy-engine.js";

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    roleProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    userAccountAccess: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    orgSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    sessionPolicy: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as any;
}

// ─── Test Subjects ──────────────────────────────────────────────────────────

const adminSubject: PolicySubject = {
  userId: "user-admin",
  organizationId: "org-1",
  userRole: "ADMIN",
};

const ownerSubject: PolicySubject = {
  userId: "user-owner",
  organizationId: "org-1",
  userRole: "OWNER",
};

const memberSubject: PolicySubject = {
  userId: "user-member",
  organizationId: "org-1",
  userRole: "MEMBER",
};

const viewerSubject: PolicySubject = {
  userId: "user-viewer",
  organizationId: "org-1",
  userRole: "VIEWER",
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("PolicyEngine", () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let engine: PolicyEngine;

  beforeEach(() => {
    prisma = createMockPrisma();
    engine = new PolicyEngine(prisma);
  });

  // ─── evaluate() — Admin users ─────────────────────────────────────────

  describe("evaluate() returns ALLOW for admin users performing any action", () => {
    it("allows ADMIN to manage permissions", async () => {
      const decision = await engine.evaluate("admin:manage_permissions", adminSubject);
      expect(decision.allowed).toBe(true);
    });

    it("allows ADMIN to view stories", async () => {
      const decision = await engine.evaluate("story:view", adminSubject);
      expect(decision.allowed).toBe(true);
    });

    it("allows ADMIN to configure integrations", async () => {
      const decision = await engine.evaluate("integration:configure", adminSubject);
      expect(decision.allowed).toBe(true);
    });

    it("allows OWNER to perform any action", async () => {
      const decision = await engine.evaluate("admin:manage_billing", ownerSubject);
      expect(decision.allowed).toBe(true);
    });

    it("allows OWNER to manage governance", async () => {
      const decision = await engine.evaluate("admin:manage_governance", ownerSubject);
      expect(decision.allowed).toBe(true);
    });
  });

  // ─── evaluate() — Viewer denied manage permissions ────────────────────

  describe("evaluate() returns DENY for viewers trying to manage permissions", () => {
    it("denies VIEWER from managing permissions", async () => {
      const decision = await engine.evaluate("admin:manage_permissions", viewerSubject);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("Insufficient permissions");
    });

    it("denies VIEWER from managing roles", async () => {
      const decision = await engine.evaluate("admin:manage_roles", viewerSubject);
      expect(decision.allowed).toBe(false);
    });

    it("denies VIEWER from creating pages", async () => {
      const decision = await engine.evaluate("page:create", viewerSubject);
      expect(decision.allowed).toBe(false);
    });

    it("denies VIEWER from generating stories", async () => {
      const decision = await engine.evaluate("story:generate", viewerSubject);
      expect(decision.allowed).toBe(false);
    });

    it("denies VIEWER from configuring integrations", async () => {
      const decision = await engine.evaluate("integration:configure", viewerSubject);
      expect(decision.allowed).toBe(false);
    });
  });

  // ─── evaluate() — Member allowed actions ──────────────────────────────

  describe("evaluate() returns ALLOW for members performing allowed actions", () => {
    it("allows MEMBER to view stories", async () => {
      const decision = await engine.evaluate("story:view", memberSubject);
      expect(decision.allowed).toBe(true);
    });

    it("allows MEMBER to create pages", async () => {
      const decision = await engine.evaluate("page:create", memberSubject);
      expect(decision.allowed).toBe(true);
    });

    it("allows MEMBER to view accounts", async () => {
      const decision = await engine.evaluate("account:view", memberSubject);
      expect(decision.allowed).toBe(true);
    });

    it("allows MEMBER to view transcripts", async () => {
      const decision = await engine.evaluate("transcript:view", memberSubject);
      expect(decision.allowed).toBe(true);
    });

    it("denies MEMBER from deleting stories", async () => {
      const decision = await engine.evaluate("story:delete", memberSubject);
      expect(decision.allowed).toBe(false);
    });

    it("denies MEMBER from managing permissions", async () => {
      const decision = await engine.evaluate("admin:manage_permissions", memberSubject);
      expect(decision.allowed).toBe(false);
    });
  });

  // ─── evaluate() — Role profile permissions ────────────────────────────

  describe("evaluate() handles role profile permissions correctly", () => {
    it("grants access via role profile when base role denies it", async () => {
      const subjectWithProfile: PolicySubject = {
        ...viewerSubject,
        roleProfileId: "profile-1",
      };

      prisma.roleProfile.findUnique.mockResolvedValue({
        permissions: ["MANAGE_PERMISSIONS"],
        canAccessAnonymousStories: true,
        canGenerateAnonymousStories: true,
        canAccessNamedStories: false,
        canGenerateNamedStories: false,
        defaultAccountScopeType: "ALL_ACCOUNTS",
        defaultAccountIds: [],
      });

      const decision = await engine.evaluate("admin:manage_permissions", subjectWithProfile);
      expect(decision.allowed).toBe(true);
    });

    it("does not grant access when profile has no matching permissions", async () => {
      const subjectWithProfile: PolicySubject = {
        ...viewerSubject,
        roleProfileId: "profile-2",
      };

      prisma.roleProfile.findUnique.mockResolvedValue({
        permissions: ["VIEW_ANALYTICS"],
        canAccessAnonymousStories: true,
        canGenerateAnonymousStories: false,
        canAccessNamedStories: false,
        canGenerateNamedStories: false,
        defaultAccountScopeType: "ALL_ACCOUNTS",
        defaultAccountIds: [],
      });

      const decision = await engine.evaluate("integration:configure", subjectWithProfile);
      expect(decision.allowed).toBe(false);
    });

    it("returns null profile gracefully when profile not found", async () => {
      const subjectWithProfile: PolicySubject = {
        ...viewerSubject,
        roleProfileId: "nonexistent-profile",
      };

      prisma.roleProfile.findUnique.mockResolvedValue(null);

      const decision = await engine.evaluate("admin:manage_permissions", subjectWithProfile);
      expect(decision.allowed).toBe(false);
    });

    it("caches role profile and reuses on second call", async () => {
      const subjectWithProfile: PolicySubject = {
        ...viewerSubject,
        roleProfileId: "profile-cached",
      };

      prisma.roleProfile.findUnique.mockResolvedValue({
        permissions: ["CREATE_LANDING_PAGE"],
        canAccessAnonymousStories: true,
        canGenerateAnonymousStories: true,
        canAccessNamedStories: false,
        canGenerateNamedStories: false,
        defaultAccountScopeType: "ALL_ACCOUNTS",
        defaultAccountIds: [],
      });

      await engine.evaluate("page:create", subjectWithProfile);
      await engine.evaluate("page:create", subjectWithProfile);

      // Should only call findUnique once because of caching
      expect(prisma.roleProfile.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  // ─── evaluateBatch() ──────────────────────────────────────────────────

  describe("evaluateBatch() returns correct decisions for multiple actions", () => {
    it("returns mixed results for member actions", async () => {
      const results = await engine.evaluateBatch(
        ["story:view", "story:delete", "page:create", "admin:manage_permissions"],
        memberSubject
      );

      expect(results["story:view"]).toBe(true);
      expect(results["story:delete"]).toBe(false);
      expect(results["page:create"]).toBe(true);
      expect(results["admin:manage_permissions"]).toBe(false);
    });

    it("returns all true for owner", async () => {
      const results = await engine.evaluateBatch(
        ["story:view", "story:delete", "admin:manage_permissions", "admin:manage_billing"],
        ownerSubject
      );

      expect(results["story:view"]).toBe(true);
      expect(results["story:delete"]).toBe(true);
      expect(results["admin:manage_permissions"]).toBe(true);
      expect(results["admin:manage_billing"]).toBe(true);
    });

    it("returns all false for viewer on restricted actions", async () => {
      const results = await engine.evaluateBatch(
        ["story:generate", "page:create", "integration:configure"],
        viewerSubject
      );

      expect(results["story:generate"]).toBe(false);
      expect(results["page:create"]).toBe(false);
      expect(results["integration:configure"]).toBe(false);
    });
  });

  // ─── evaluate() — MFA required ────────────────────────────────────────

  describe("evaluate() returns MFA_REQUIRED for sensitive actions when MFA is configured", () => {
    it("denies admin:manage_permissions when MFA is required but not verified", async () => {
      prisma.sessionPolicy.findUnique.mockResolvedValue({
        organizationId: "org-1",
        mfaRequired: true,
      });

      const context: PolicyContext = {
        mfaVerified: false,
      };

      const decision = await engine.evaluate(
        "admin:manage_permissions",
        adminSubject,
        undefined,
        context
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("MFA");
    });

    it("allows admin:manage_permissions when MFA is verified", async () => {
      prisma.sessionPolicy.findUnique.mockResolvedValue({
        organizationId: "org-1",
        mfaRequired: true,
      });

      const context: PolicyContext = {
        mfaVerified: true,
      };

      const decision = await engine.evaluate(
        "admin:manage_permissions",
        adminSubject,
        undefined,
        context
      );

      expect(decision.allowed).toBe(true);
    });

    it("allows sensitive actions when org has no MFA policy", async () => {
      prisma.sessionPolicy.findUnique.mockResolvedValue(null);

      const context: PolicyContext = {
        mfaVerified: false,
      };

      const decision = await engine.evaluate(
        "admin:manage_permissions",
        adminSubject,
        undefined,
        context
      );

      expect(decision.allowed).toBe(true);
    });

    it("skips MFA check when no context is provided", async () => {
      prisma.sessionPolicy.findUnique.mockResolvedValue({
        organizationId: "org-1",
        mfaRequired: true,
      });

      // No context passed — MFA check should be skipped
      const decision = await engine.evaluate("admin:manage_permissions", adminSubject);
      expect(decision.allowed).toBe(true);
    });

    it("denies governance:approve_deletion without MFA", async () => {
      prisma.sessionPolicy.findUnique.mockResolvedValue({
        organizationId: "org-1",
        mfaRequired: true,
      });

      const context: PolicyContext = { mfaVerified: false };

      const decision = await engine.evaluate(
        "governance:approve_deletion",
        ownerSubject,
        undefined,
        context
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("MFA");
    });
  });
});
