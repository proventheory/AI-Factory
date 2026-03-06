"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/**
 * Captures React render errors and reports them to Sentry when DSN is set.
 * See https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-render-errors-in-app-router
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
