"use client";

import { PageFrame, Stack, PageHeader, Card, CardHeader, CardContent } from "@/components/ui";

export default function OperatorGuidePage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="How it works"
          description="How the Console, Control Plane, and database fit together."
        />
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
          <Card>
            <CardHeader className="text-base font-semibold">The three pieces</CardHeader>
            <CardContent className="space-y-2 text-body-small text-slate-600">
              <p>
                <strong>Console (ProfessorX)</strong> — This UI. Runs on Vercel. Every nav link stays inside this app so the menu never leaves.
              </p>
              <p>
                <strong>Control Plane</strong> — Backend API + scheduler. Runs on Render. Handles initiatives, plans, runs, cost data, launches. Talks to Postgres.
              </p>
              <p>
                <strong>Runners</strong> — Workers that run pipeline jobs (email gen, copy, etc.). Get work from Control Plane; write to DB/artifacts.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="text-base font-semibold">Request flow</CardHeader>
            <CardContent className="text-body-small text-slate-600">
              <p className="font-mono text-xs bg-slate-100 rounded p-2 mb-2">
                Browser → Console → Control Plane API → Postgres
              </p>
              <p>
                The Console calls <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_CONTROL_PLANE_API</code>. If you see &quot;relation does not exist&quot; or empty data, the DB the Control Plane uses likely needs migrations: <code className="rounded bg-slate-100 px-1">npm run db:migrate</code> with that <code className="rounded bg-slate-100 px-1">DATABASE_URL</code>.
              </p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader className="text-base font-semibold">Where to go for what</CardHeader>
          <CardContent className="text-body-small text-slate-600">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Initiatives, plans, runs</strong> → Orchestration</li>
              <li><strong>Email / Klaviyo</strong> → Email Design Generator, Klaviyo</li>
              <li><strong>Launches (deploy preview)</strong> → Launches</li>
              <li><strong>LLM cost</strong> → Cost Dashboard</li>
              <li><strong>Graph, repair, deploys</strong> → Graph Explorer, Deploy events, etc.</li>
              <li><strong>Brands, templates</strong> → Brand &amp; Design</li>
              <li><strong>Policies, budgets</strong> → Config</li>
            </ul>
          </CardContent>
        </Card>
        <p className="text-body-small text-slate-500">
          Full overview: <code className="rounded bg-slate-100 px-1">docs/HOW_IT_WORKS.md</code> in the repo.
        </p>
      </Stack>
    </PageFrame>
  );
}
