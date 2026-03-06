const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy /email-marketing to the Email Marketing Factory app only when target is a public URL.
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
      { source: "/email-marketing", destination: `${trimmed}/email-marketing` },
      { source: "/email-marketing/:path*", destination: `${trimmed}/email-marketing/:path*` },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
});
