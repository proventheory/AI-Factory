"use client";

import Link from "next/link";

export default function EmailMarketingPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Email Marketing</h1>
      <p className="text-slate-600 mb-4">
        The Email Marketing Factory app is part of this repo. To run it and see it here (same origin):
      </p>
      <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700 mb-6">
        <li>Copy the app: <code className="bg-slate-100 px-1 rounded">./scripts/clone-email-marketing-factory.sh</code></li>
        <li>Apply framework changes (see <code className="bg-slate-100 px-1 rounded">docs/EMAIL_MARKETING_FACTORY_INTEGRATION.md</code>)</li>
        <li>Run it with basePath: <code className="bg-slate-100 px-1 rounded">cd email-marketing-factory && pnpm dev</code> (e.g. port 3002)</li>
        <li>Set <code className="bg-slate-100 px-1 rounded">NEXT_PUBLIC_EMAIL_MARKETING_ORIGIN=http://localhost:3002</code> in <code className="bg-slate-100 px-1 rounded">console/.env.local</code></li>
        <li>Restart the Console; then this nav will proxy to the app.</li>
      </ol>
      <Link href="/dashboard" className="text-brand-600 hover:underline text-sm">← Back to Overview</Link>
    </div>
  );
}
