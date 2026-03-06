const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy /email-marketing to the Email Marketing Factory app (same-origin; app runs with basePath /email-marketing)
  async rewrites() {
    const target = process.env.NEXT_PUBLIC_EMAIL_MARKETING_ORIGIN;
    if (!target) return [];
    return [
      { source: "/email-marketing", destination: `${target}/email-marketing` },
      { source: "/email-marketing/:path*", destination: `${target}/email-marketing/:path*` },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
});
