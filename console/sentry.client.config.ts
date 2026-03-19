/**
 * Sentry client-side init (Console). Only sends events when SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN is set.
 * See docs/LLM_GATEWAY_AND_OPTIMIZATION.md and REFERENCE_REPOS_DISCUSSED.md (Observability).
 *
 * To reduce information disclosure in strict environments (per docs/MAESTRON_RECON_2026-03-16.md),
 * set SENTRY_RELEASE to a generic value (e.g. "production") in Vercel env so the HTML doesn’t expose the git commit.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    release: process.env.SENTRY_RELEASE,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
}
