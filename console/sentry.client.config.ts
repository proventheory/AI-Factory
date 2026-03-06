/**
 * Sentry client-side init (Console). Only sends events when SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN is set.
 * See docs/LLM_GATEWAY_AND_OPTIMIZATION.md and REFERENCE_REPOS_DISCUSSED.md (Observability).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
}
