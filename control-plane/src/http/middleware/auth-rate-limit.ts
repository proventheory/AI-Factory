import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

export function isAuthPath(path: string): boolean {
  return /\/v1\/seo\/google|google_access_token|google_connected|google_credentials/.test(path);
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many authentication requests; try again later." },
  standardHeaders: true,
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_PER_MIN) || 300,
  message: { error: "Too many requests; try again later." },
  standardHeaders: true,
});

/** Callback with error=missing_code_or_state: skip rate limit so handler can return 400 and break the loop. */
function isOAuthErrorCallback(req: Request): boolean {
  return (
    req.method === "GET" &&
    /\/v1\/seo\/google\/callback/.test(req.path) &&
    req.query?.error === "missing_code_or_state"
  );
}

/** Select auth vs general rate limiter by path. Use as app.use(selectiveRateLimiter). */
export function selectiveRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (isOAuthErrorCallback(req)) {
    next();
    return;
  }
  if (isAuthPath(req.path)) {
    authLimiter(req, res, next);
  } else {
    generalLimiter(req, res, next);
  }
}
