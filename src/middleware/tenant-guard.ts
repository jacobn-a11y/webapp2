/**
 * Centralized Tenant Guard Utilities
 *
 * Provides multi-tenant isolation enforcement for all route handlers.
 * Every database query and mutation MUST go through these utilities
 * to prevent cross-tenant data access.
 */

import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
import logger from "../lib/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TenantContext {
  organizationId: string;
  userId: string;
  userRole: string;
}

export interface AuthenticatedRequest extends Request {
  organizationId?: string;
  userId?: string;
  userRole?: string;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware that ensures the request has a valid tenant context.
 * Must be used after auth middleware that sets organizationId/userId.
 */
export function requireTenant(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.organizationId || !req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

/**
 * Express middleware that ensures the request is from an admin (OWNER or ADMIN role).
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.organizationId || !req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!req.userRole || !["OWNER", "ADMIN"].includes(req.userRole)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// ─── Context Extraction ──────────────────────────────────────────────────────

/**
 * Extracts tenant context from an authenticated request.
 * Throws if context is missing (use after requireTenant middleware).
 */
export function extractTenantContext(req: AuthenticatedRequest): TenantContext {
  if (!req.organizationId || !req.userId) {
    throw new Error("Tenant context missing — ensure requireTenant middleware is applied");
  }
  return {
    organizationId: req.organizationId,
    userId: req.userId,
    userRole: req.userRole ?? "MEMBER",
  };
}

// ─── Query Scoping ───────────────────────────────────────────────────────────

/**
 * Adds organizationId scoping to a Prisma where clause.
 * Use this on EVERY query to ensure tenant isolation.
 *
 * @example
 * const stories = await prisma.story.findMany({
 *   where: enforceTenantScope(ctx, { accountId: "..." }),
 * });
 */
export function enforceTenantScope<T extends Record<string, unknown>>(
  ctx: TenantContext | string,
  where: T
): T & { organizationId: string } {
  const orgId = typeof ctx === "string" ? ctx : ctx.organizationId;
  return { ...where, organizationId: orgId };
}

/**
 * Verifies that a resource belongs to the requesting organization.
 * Throws a TenantAccessError if the resource doesn't belong to the org.
 *
 * @example
 * const story = await prisma.story.findUnique({ where: { id } });
 * assertTenantOwnership(ctx, story, "Story");
 */
export function assertTenantOwnership(
  ctx: TenantContext | string,
  resource: { organizationId: string } | null | undefined,
  resourceName: string
): asserts resource is { organizationId: string } {
  const orgId = typeof ctx === "string" ? ctx : ctx.organizationId;
  if (!resource) {
    throw new TenantAccessError(`${resourceName} not found`);
  }
  if (resource.organizationId !== orgId) {
    logger.warn("Cross-tenant access attempt blocked", {
      requestedOrgId: orgId,
      resourceOrgId: resource.organizationId,
      resourceName,
    });
    throw new TenantAccessError(`${resourceName} not found`);
  }
}

/**
 * Custom error for tenant access violations.
 * Route handlers should catch this and return 404 (not 403, to avoid leaking resource existence).
 */
export class TenantAccessError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "TenantAccessError";
  }
}

/**
 * Express error handler for TenantAccessError.
 * Returns 404 to avoid leaking information about resources in other tenants.
 */
export function tenantErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof TenantAccessError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  next(err);
}

// ─── Scoped Query Builder ────────────────────────────────────────────────────

/**
 * Creates a tenant-scoped query helper for a specific org.
 * Provides convenience methods that automatically scope all operations.
 *
 * @example
 * const scoped = createTenantScopedQuery(prisma, ctx);
 * const stories = await scoped.findMany("story", { accountId: "..." });
 */
export function createTenantScopedQuery(
  prisma: PrismaClient,
  ctx: TenantContext
) {
  return {
    /**
     * Find a single record scoped to the tenant.
     * Returns null if not found or belongs to different tenant.
     */
    async findFirst<T>(
      model: string,
      where: Record<string, unknown>,
      select?: Record<string, boolean>
    ): Promise<T | null> {
      const scopedWhere = enforceTenantScope(ctx, where);
      const delegate = (prisma as Record<string, any>)[model];
      if (!delegate?.findFirst) {
        throw new Error(`Invalid model: ${model}`);
      }
      return delegate.findFirst({
        where: scopedWhere,
        ...(select ? { select } : {}),
      });
    },

    /**
     * Find many records scoped to the tenant.
     */
    async findMany<T>(
      model: string,
      where: Record<string, unknown> = {},
      options?: { orderBy?: Record<string, string>; take?: number; skip?: number; select?: Record<string, boolean> }
    ): Promise<T[]> {
      const scopedWhere = enforceTenantScope(ctx, where);
      const delegate = (prisma as Record<string, any>)[model];
      if (!delegate?.findMany) {
        throw new Error(`Invalid model: ${model}`);
      }
      return delegate.findMany({
        where: scopedWhere,
        ...options,
      });
    },

    /**
     * Get the tenant context.
     */
    get context() {
      return ctx;
    },
  };
}
