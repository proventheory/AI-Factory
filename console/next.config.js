const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Security headers (per Maestron recon recommendations: CSP, X-Frame-Options, etc.)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // CSP: allow self, inline scripts (Next.js), Sentry, Vercel; tighten as needed
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io https://vercel.live",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' https: http://localhost:* http://127.0.0.1:* wss: https://*.sentry.io https://*.ingest.sentry.io wss://*.sentry.io",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  // Proxy /email-design-generator to the Email Design Generator app only when target is a public URL.
  // Skip rewrites for localhost/private so Vercel never tries to proxy to them (avoids 404 DNS_HOSTNAME_RESOLVED_PRIVATE).
  async rewrites() {
    const target = process.env.NEXT_PUBLIC_EMAIL_MARKETING_ORIGIN;
    if (!target || typeof target !== "string") return [];
    const trimmed = target.trim();
    if (!trimmed) return [];
    try {
      const u = new URL(trimmed);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname.endsWith(".local")) return [];
    } catch {
      return [];
    }
    return [
      { source: "/email-design-generator", destination: `${trimmed}/email-design-generator` },
      { source: "/email-design-generator/:path*", destination: `${trimmed}/email-design-generator/:path*` },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
});
