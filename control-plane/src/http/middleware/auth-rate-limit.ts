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

/** Exempt all GET to OAuth callback — no rate limit so controller can return 400. Match by substring so proxy/mount cannot break it. */
function isOAuthCallbackPath(req: Request): boolean {
  if (req.method !== "GET") return false;
  const path = (req.path ?? "").replace(/\/$/, "");
  const originalUrl = (req.originalUrl ?? req.url ?? "").replace(/\/$/, "");
  const pathPart = originalUrl.split("?")[0];
  return (
    path.includes("seo/google/callback") ||
    pathPart.includes("seo/google/callback") ||
    originalUrl.includes("seo/google/callback")
  );
}

/** Select auth vs general rate limiter by path. Use as app.use(selectiveRateLimiter). */
export function selectiveRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const exempt = isOAuthCallbackPath(req);
  const path = req.path ?? "";
  const originalUrl = req.originalUrl ?? req.url ?? "";
  const isCallbackRequest = path.includes("seo/google/callback") || originalUrl.includes("seo/google/callback");
  if (isCallbackRequest || isAuthPath(path)) {
    console.log("AUTH LIMIT CHECK", {
      method: req.method,
      path,
      originalUrl,
      query: req.query,
      exempt,
      isCallbackRequest,
    });
  }
  if (exempt) {
    next();
    return;
  }
  if (isAuthPath(path)) {
    authLimiter(req, res, next);
  } else {
    generalLimiter(req, res, next);
  }
}
