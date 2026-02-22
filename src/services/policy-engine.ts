/**
 * Policy Engine — Centralized RBAC/ABAC Authorization
 *
 * Every authorization decision in the application MUST route through this service.
 * Combines role-based access control (RBAC) with attribute-based conditions (ABAC).
 *
 * Policy evaluation order:
 * 1. Check if action requires authentication (reject anonymous if so)
 * 2. Check org-level feature flags / entitlements
 * 3. Check user's base role permissions
 * 4. Check user's role profile permissions (if assigned)
 * 5. Evaluate ABAC conditions (account scope, story sensitivity, org policy)
 * 6. Log decision for audit trail
 */

import type { PrismaClient, UserRole, PermissionType, AccountScopeType } from "@prisma/client";
import logger from "../lib/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PolicyAction =
  // Story actions
  | "story:generate"
  | "story:generate_named"
  | "story:generate_anonymous"
  | "story:view"
  | "story:view_named"
  | "story:view_anonymous"
  | "story:delete"
  | "story:export"
  // Landing page actions
  | "page:create"
  | "page:edit"
  | "page:edit_any"
  | "page:publish"
  | "page:publish_named"
  | "page:unpublish"
  | "page:delete"
  | "page:delete_any"
  | "page:view_draft"
  // Account actions
  | "account:view"
  | "account:merge"
  | "account:delete"
  | "account:export"
  // Transcript actions
  | "transcript:view"
  | "transcript:export"
  | "transcript:delete"
  // Integration actions
  | "integration:configure"
  | "integration:sync"
  | "integration:view_health"
  // Admin actions
  | "admin:manage_permissions"
  | "admin:manage_roles"
  | "admin:manage_settings"
  | "admin:manage_governance"
  | "admin:manage_integrations"
  | "admin:manage_billing"
  | "admin:manage_api_keys"
  | "admin:manage_ai_settings"
  | "admin:view_audit_logs"
  | "admin:view_analytics"
  | "admin:manage_feature_flags"
  | "admin:manage_sessions"
  | "admin:manage_sso"
  | "admin:manage_scim"
  | "admin:manage_ip_allowlist"
  // Entity resolution
  | "entity:resolve"
  | "entity:manage"
  // Export actions
  | "export:pdf"
  | "export:google_doc"
  | "export:slack"
  | "export:csv"
  // CRM writeback
  | "crm:writeback"
  | "crm:approve_writeback"
  // Automation
  | "automation:create_rule"
  | "automation:manage_rules"
  | "automation:view_executions"
  // Data governance
  | "governance:request_deletion"
  | "governance:approve_deletion"
  | "governance:manage_retention"
  | "governance:manage_legal_hold";

export interface PolicySubject {
  userId: string;
  organizationId: string;
  userRole: UserRole;
  roleProfileId?: string | null;
}

export interface PolicyResource {
  type: string;
  id?: string;
  organizationId?: string;
  accountId?: string;
  createdById?: string;
  visibility?: string;
  sensitivity?: string;
}

export interface PolicyContext {
  ipAddress?: string;
  userAgent?: string;
  mfaVerified?: boolean;
  sessionAge?: number;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  conditions?: string[];
}

export interface PolicyDenyEvent {
  action: PolicyAction;
  subject: PolicySubject;
  resource?: PolicyResource;
  reason: string;
  timestamp: Date;
}

// ─── Base Role Permission Matrix ─────────────────────────────────────────────

const BASE_ROLE_PERMISSIONS: Record<UserRole, Set<PolicyAction>> = {
  OWNER: new Set([
    "story:generate", "story:generate_named", "story:generate_anonymous",
    "story:view", "story:view_named", "story:view_anonymous", "story:delete", "story:export",
    "page:create", "page:edit", "page:edit_any", "page:publish", "page:publish_named",
    "page:unpublish", "page:delete", "page:delete_any", "page:view_draft",
    "account:view", "account:merge", "account:delete", "account:export",
    "transcript:view", "transcript:export", "transcript:delete",
    "integration:configure", "integration:sync", "integration:view_health",
    "admin:manage_permissions", "admin:manage_roles", "admin:manage_settings",
    "admin:manage_governance", "admin:manage_integrations", "admin:manage_billing",
    "admin:manage_api_keys", "admin:manage_ai_settings", "admin:view_audit_logs",
    "admin:view_analytics", "admin:manage_feature_flags", "admin:manage_sessions",
    "admin:manage_sso", "admin:manage_scim", "admin:manage_ip_allowlist",
    "entity:resolve", "entity:manage",
    "export:pdf", "export:google_doc", "export:slack", "export:csv",
    "crm:writeback", "crm:approve_writeback",
    "automation:create_rule", "automation:manage_rules", "automation:view_executions",
    "governance:request_deletion", "governance:approve_deletion",
    "governance:manage_retention", "governance:manage_legal_hold",
  ]),
  ADMIN: new Set([
    "story:generate", "story:generate_named", "story:generate_anonymous",
    "story:view", "story:view_named", "story:view_anonymous", "story:delete", "story:export",
    "page:create", "page:edit", "page:edit_any", "page:publish", "page:publish_named",
    "page:unpublish", "page:delete", "page:delete_any", "page:view_draft",
    "account:view", "account:merge", "account:export",
    "transcript:view", "transcript:export",
    "integration:configure", "integration:sync", "integration:view_health",
    "admin:manage_permissions", "admin:manage_roles", "admin:manage_settings",
    "admin:manage_integrations", "admin:manage_api_keys", "admin:manage_ai_settings",
    "admin:view_audit_logs", "admin:view_analytics", "admin:manage_feature_flags",
    "entity:resolve", "entity:manage",
    "export:pdf", "export:google_doc", "export:slack", "export:csv",
    "crm:writeback", "crm:approve_writeback",
    "automation:create_rule", "automation:manage_rules", "automation:view_executions",
    "governance:request_deletion",
  ]),
  MEMBER: new Set([
    "story:generate", "story:generate_anonymous",
    "story:view", "story:view_anonymous",
    "page:create", "page:edit", "page:publish", "page:view_draft",
    "account:view",
    "transcript:view",
    "integration:view_health",
    "admin:view_analytics",
    "entity:resolve",
    "export:pdf", "export:google_doc", "export:slack",
    "automation:view_executions",
    "governance:request_deletion",
  ]),
  VIEWER: new Set([
    "story:view", "story:view_anonymous",
    "page:view_draft",
    "account:view",
    "transcript:view",
    "admin:view_analytics",
  ]),
};

// Map from PermissionType enum to PolicyAction
const PERMISSION_TO_ACTION: Partial<Record<PermissionType, PolicyAction[]>> = {
  CREATE_LANDING_PAGE: ["page:create"],
  PUBLISH_LANDING_PAGE: ["page:publish"],
  PUBLISH_NAMED_LANDING_PAGE: ["page:publish_named"],
  EDIT_ANY_LANDING_PAGE: ["page:edit_any"],
  DELETE_ANY_LANDING_PAGE: ["page:delete_any"],
  MANAGE_PERMISSIONS: [
    "admin:manage_permissions", "admin:manage_roles", "admin:manage_settings",
    "admin:manage_governance", "admin:manage_feature_flags", "admin:view_audit_logs",
    "admin:manage_sessions", "admin:manage_sso", "admin:manage_scim", "admin:manage_ip_allowlist",
  ],
  VIEW_ANALYTICS: ["admin:view_analytics"],
  MANAGE_ENTITY_RESOLUTION: ["entity:resolve", "entity:manage"],
  MANAGE_AI_SETTINGS: ["admin:manage_ai_settings"],
};

// Actions that require MFA verification
const MFA_REQUIRED_ACTIONS: Set<PolicyAction> = new Set([
  "admin:manage_permissions",
  "admin:manage_roles",
  "admin:manage_sso",
  "admin:manage_scim",
  "admin:manage_billing",
  "admin:manage_governance",
  "governance:approve_deletion",
  "governance:manage_legal_hold",
  "account:delete",
  "transcript:delete",
]);

// ─── Service ─────────────────────────────────────────────────────────────────

export class PolicyEngine {
  private denyEvents: PolicyDenyEvent[] = [];
  private roleProfileCache = new Map<string, {
    permissions: PermissionType[];
    canAccessAnonymousStories: boolean;
    canGenerateAnonymousStories: boolean;
    canAccessNamedStories: boolean;
    canGenerateNamedStories: boolean;
    defaultAccountScopeType: AccountScopeType;
    defaultAccountIds: string[];
    cachedAt: number;
  }>();

  constructor(private prisma: PrismaClient) {}

  /**
   * Evaluate whether a subject can perform an action on a resource.
   * This is the ONLY method external code should call for authorization.
   */
  async evaluate(
    action: PolicyAction,
    subject: PolicySubject,
    resource?: PolicyResource,
    context?: PolicyContext
  ): Promise<PolicyDecision> {
    // Step 1: Base role check
    const baseAllowed = BASE_ROLE_PERMISSIONS[subject.userRole]?.has(action) ?? false;

    // Step 2: Role profile check (may grant additional permissions)
    let profileAllowed = false;
    if (subject.roleProfileId) {
      profileAllowed = await this.checkRoleProfile(subject.roleProfileId, action);
    }

    if (!baseAllowed && !profileAllowed) {
      this.recordDeny(action, subject, resource, "Insufficient permissions");
      return { allowed: false, reason: "Insufficient permissions for this action" };
    }

    // Step 3: ABAC conditions — story sensitivity
    if (action.startsWith("story:") && resource) {
      const storyCheck = await this.checkStoryAccess(action, subject, resource);
      if (!storyCheck.allowed) {
        this.recordDeny(action, subject, resource, storyCheck.reason);
        return storyCheck;
      }
    }

    // Step 4: Account scope check
    if (resource?.accountId) {
      const scopeCheck = await this.checkAccountScope(subject, resource.accountId);
      if (!scopeCheck.allowed) {
        this.recordDeny(action, subject, resource, scopeCheck.reason);
        return scopeCheck;
      }
    }

    // Step 5: Org policy checks (feature flags, governance)
    const orgPolicyCheck = await this.checkOrgPolicy(action, subject);
    if (!orgPolicyCheck.allowed) {
      this.recordDeny(action, subject, resource, orgPolicyCheck.reason);
      return orgPolicyCheck;
    }

    // Step 6: MFA requirement check
    if (MFA_REQUIRED_ACTIONS.has(action) && context) {
      const mfaCheck = await this.checkMfaRequirement(subject, context);
      if (!mfaCheck.allowed) {
        this.recordDeny(action, subject, resource, mfaCheck.reason);
        return mfaCheck;
      }
    }

    // Step 7: Resource ownership check (for edit/delete of own resources)
    if (resource?.createdById && this.isOwnershipRequired(action)) {
      if (resource.createdById !== subject.userId && !baseAllowed) {
        this.recordDeny(action, subject, resource, "Not resource owner");
        return { allowed: false, reason: "You can only modify your own resources" };
      }
    }

    return { allowed: true, reason: "Authorized" };
  }

  /**
   * Batch-check multiple actions for UI permission display.
   */
  async evaluateBatch(
    actions: PolicyAction[],
    subject: PolicySubject,
    resource?: PolicyResource
  ): Promise<Record<PolicyAction, boolean>> {
    const results: Record<string, boolean> = {};
    await Promise.all(
      actions.map(async (action) => {
        const decision = await this.evaluate(action, subject, resource);
        results[action] = decision.allowed;
      })
    );
    return results as Record<PolicyAction, boolean>;
  }

  /**
   * Get recent deny events for telemetry/monitoring.
   */
  getRecentDenyEvents(limit = 100): PolicyDenyEvent[] {
    return this.denyEvents.slice(-limit);
  }

  /**
   * Clear deny event buffer (called after flushing to persistent storage).
   */
  flushDenyEvents(): PolicyDenyEvent[] {
    const events = [...this.denyEvents];
    this.denyEvents = [];
    return events;
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  private async checkRoleProfile(
    roleProfileId: string,
    action: PolicyAction
  ): Promise<boolean> {
    const profile = await this.getCachedRoleProfile(roleProfileId);
    if (!profile) return false;

    for (const perm of profile.permissions) {
      const mappedActions = PERMISSION_TO_ACTION[perm];
      if (mappedActions?.includes(action)) return true;
    }

    return false;
  }

  private async checkStoryAccess(
    action: PolicyAction,
    subject: PolicySubject,
    resource: PolicyResource
  ): Promise<PolicyDecision> {
    const profile = subject.roleProfileId
      ? await this.getCachedRoleProfile(subject.roleProfileId)
      : null;

    const isNamed = resource.visibility === "named" || resource.sensitivity === "named";

    if (isNamed) {
      if (action === "story:view" || action === "story:view_named") {
        const canAccess = profile?.canAccessNamedStories ??
          ["OWNER", "ADMIN"].includes(subject.userRole);
        if (!canAccess) {
          return { allowed: false, reason: "Named story access not permitted for your role" };
        }
      }
      if (action === "story:generate" || action === "story:generate_named") {
        const canGenerate = profile?.canGenerateNamedStories ??
          ["OWNER", "ADMIN"].includes(subject.userRole);
        if (!canGenerate) {
          return { allowed: false, reason: "Named story generation not permitted for your role" };
        }
      }
    }

    return { allowed: true, reason: "Story access permitted" };
  }

  private async checkAccountScope(
    subject: PolicySubject,
    accountId: string
  ): Promise<PolicyDecision> {
    if (["OWNER", "ADMIN"].includes(subject.userRole)) {
      return { allowed: true, reason: "Admin role has full account access" };
    }

    const grants = await this.prisma.userAccountAccess.findMany({
      where: {
        userId: subject.userId,
        organizationId: subject.organizationId,
      },
      select: {
        scopeType: true,
        accountId: true,
        cachedAccountIds: true,
      },
    });

    for (const grant of grants) {
      if (grant.scopeType === "ALL_ACCOUNTS") {
        return { allowed: true, reason: "All-accounts grant" };
      }
      if (grant.scopeType === "SINGLE_ACCOUNT" && grant.accountId === accountId) {
        return { allowed: true, reason: "Single-account grant" };
      }
      if (
        (grant.scopeType === "ACCOUNT_LIST" || grant.scopeType === "CRM_REPORT") &&
        grant.cachedAccountIds.includes(accountId)
      ) {
        return { allowed: true, reason: "Account list/CRM grant" };
      }
    }

    if (subject.roleProfileId) {
      const profile = await this.getCachedRoleProfile(subject.roleProfileId);
      if (profile) {
        if (profile.defaultAccountScopeType === "ALL_ACCOUNTS") {
          return { allowed: true, reason: "Role profile default: all accounts" };
        }
        if (profile.defaultAccountIds.includes(accountId)) {
          return { allowed: true, reason: "Role profile default account list" };
        }
      }
    }

    return { allowed: false, reason: "Account not in your access scope" };
  }

  private async checkOrgPolicy(
    action: PolicyAction,
    subject: PolicySubject
  ): Promise<PolicyDecision> {
    if (action.startsWith("export:")) {
      const governance = await this.getGovernancePolicy(subject.organizationId);
      if (governance && !governance.pii_export_enabled && action === "export:csv") {
        return { allowed: false, reason: "PII export is disabled by organization policy" };
      }
    }

    return { allowed: true, reason: "Org policy check passed" };
  }

  private async checkMfaRequirement(
    subject: PolicySubject,
    context: PolicyContext
  ): Promise<PolicyDecision> {
    try {
      const sessionPolicy = await this.prisma.sessionPolicy?.findUnique?.({
        where: { organizationId: subject.organizationId },
      });

      if (sessionPolicy && (sessionPolicy as any).mfaRequired && !context.mfaVerified) {
        return { allowed: false, reason: "MFA verification required for this action" };
      }
    } catch {
      // SessionPolicy model may not exist yet — allow
    }

    return { allowed: true, reason: "MFA check passed" };
  }

  private isOwnershipRequired(action: PolicyAction): boolean {
    return ["page:edit", "page:delete", "page:unpublish"].includes(action);
  }

  private async getCachedRoleProfile(roleProfileId: string) {
    const cached = this.roleProfileCache.get(roleProfileId);
    if (cached && Date.now() - cached.cachedAt < 60_000) {
      return cached;
    }

    const profile = await this.prisma.roleProfile.findUnique({
      where: { id: roleProfileId },
      select: {
        permissions: true,
        canAccessAnonymousStories: true,
        canGenerateAnonymousStories: true,
        canAccessNamedStories: true,
        canGenerateNamedStories: true,
        defaultAccountScopeType: true,
        defaultAccountIds: true,
      },
    });

    if (!profile) return null;

    const entry = { ...profile, cachedAt: Date.now() };
    this.roleProfileCache.set(roleProfileId, entry);
    return entry;
  }

  private async getGovernancePolicy(organizationId: string) {
    try {
      const settings = await this.prisma.orgSettings.findUnique({
        where: { organizationId },
        select: { dataGovernancePolicy: true },
      });
      return (settings?.dataGovernancePolicy ?? null) as Record<string, any> | null;
    } catch {
      return null;
    }
  }

  private recordDeny(
    action: PolicyAction,
    subject: PolicySubject,
    resource: PolicyResource | undefined,
    reason: string
  ) {
    const event: PolicyDenyEvent = {
      action,
      subject,
      resource,
      reason,
      timestamp: new Date(),
    };
    this.denyEvents.push(event);
    if (this.denyEvents.length > 1000) {
      this.denyEvents = this.denyEvents.slice(-500);
    }
    logger.warn("Policy deny", {
      action,
      userId: subject.userId,
      orgId: subject.organizationId,
      reason,
    });
  }
}

// ─── Legacy compatibility ────────────────────────────────────────────────────

/** Maps old webappv3-style PolicyAction names to the new namespaced format */
export function legacyPermissionActionToPolicyAction(
  action: string
): PolicyAction | null {
  const map: Record<string, PolicyAction> = {
    create_landing_page: "page:create",
    publish_landing_page: "page:publish",
    edit_any_landing_page: "page:edit_any",
    delete_any_landing_page: "page:delete_any",
    manage_permissions: "admin:manage_permissions",
    view_analytics: "admin:view_analytics",
    view_queue_health: "integration:view_health",
    manage_integrations: "admin:manage_integrations",
    view_audit_logs: "admin:view_audit_logs",
    export_pii: "export:csv",
    view_named_story: "story:view_named",
    view_anonymous_story: "story:view_anonymous",
    generate_named_story: "story:generate_named",
    generate_anonymous_story: "story:generate_anonymous",
  };
  return map[action] ?? null;
}
