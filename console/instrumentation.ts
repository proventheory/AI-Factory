/**
 * Next.js instrumentation entry (required for @sentry/nextjs v9+ server/edge init).
 * See https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
