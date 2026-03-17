import type { Request } from "express";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function parseLimitOffset(
  req: Request,
  defaultLimit = DEFAULT_LIMIT,
  maxLimit = MAX_LIMIT
): { limit: number; offset: number } {
  const limit = Math.min(Number(req.query.limit) || defaultLimit, maxLimit);
  const offset = Number(req.query.offset) || 0;
  return { limit, offset };
}
