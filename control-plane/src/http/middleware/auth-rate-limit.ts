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

/** Exempt entire OAuth callback path from auth rate limit so error handler can always return 400 (no 429). */
function isOAuthCallbackPath(req: Request): boolean {
  const path = (req.path ?? req.url?.split("?")[0] ?? "").replace(/\/$/, "");
  return req.method === "GET" && (path === "/v1/seo/google/callback" || path.endsWith("/v1/seo/google/callback"));
}

/** Select auth vs general rate limiter by path. Use as app.use(selectiveRateLimiter). */
export function selectiveRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (isOAuthCallbackPath(req)) {
    next();
    return;
  }
  if (isAuthPath(req.path)) {
    authLimiter(req, res, next);
  } else {
    generalLimiter(req, res, next);
  }
}
