/**
 * Pagination Middleware & Utilities
 *
 * Provides standardized pagination for list endpoints:
 * - Cursor-based pagination for large/real-time datasets
 * - Offset pagination for admin pages and reports
 * - Consistent response envelope
 */

import type { Request } from "express";

export interface PaginationParams {
  limit: number;
  offset: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total?: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Extract pagination params from Express request query.
 * Supports both offset-based (?limit=50&offset=0) and cursor-based (?cursor=xxx&limit=50).
 */
export function parsePagination(req: Request): PaginationParams {
  const rawLimit = Number(req.query.limit) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

  return { limit, offset, cursor };
}

/**
 * Build a paginated response envelope.
 */
export function paginatedResponse<T extends { id: string }>(
  data: T[],
  params: PaginationParams,
  total?: number
): PaginatedResponse<T> {
  const hasMore = data.length === params.limit;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : undefined;

  return {
    data,
    pagination: {
      total,
      limit: params.limit,
      offset: params.offset,
      hasMore,
      nextCursor,
    },
  };
}

/**
 * Build Prisma query arguments for offset pagination.
 */
export function prismaPaginationArgs(params: PaginationParams) {
  if (params.cursor) {
    return {
      take: params.limit,
      skip: 1,
      cursor: { id: params.cursor },
    };
  }
  return {
    take: params.limit,
    skip: params.offset,
  };
}
