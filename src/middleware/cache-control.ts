/**
 * Cache Control Middleware
 *
 * Applies appropriate cache headers to API responses based on endpoint type:
 * - Static config endpoints: Cache for 5 minutes
 * - Dashboard data: Cache for 1 minute
 * - User-specific data: No cache (private)
 * - Mutation endpoints: No cache
 */

import type { Request, Response, NextFunction } from "express";

export interface CacheOptions {
  maxAge: number;       // seconds
  staleWhileRevalidate?: number;  // seconds
  isPrivate?: boolean;
}

export function cacheControl(options: CacheOptions) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const directives: string[] = [];

    if (options.isPrivate) {
      directives.push("private");
    } else {
      directives.push("public");
    }

    directives.push(`max-age=${options.maxAge}`);

    if (options.staleWhileRevalidate) {
      directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
    }

    res.setHeader("Cache-Control", directives.join(", "));
    next();
  };
}

/** No caching — for mutations and sensitive data */
export function noCache(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
}

/** Short cache for dashboard/analytics data (60s, private) */
export const dashboardCache = cacheControl({
  maxAge: 60,
  staleWhileRevalidate: 30,
  isPrivate: true,
});

/** Medium cache for config/reference data (300s) */
export const configCache = cacheControl({
  maxAge: 300,
  staleWhileRevalidate: 60,
  isPrivate: true,
});

/** Long cache for truly static data (1 hour) */
export const staticCache = cacheControl({
  maxAge: 3600,
  staleWhileRevalidate: 300,
});
