"use client";

import Link from "next/link";
import {
  PageFrame,
  Stack,
  PageHeader,
  CardSection,
} from "@/components/ui";

export default function SelfHealPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Self-heal"
          description="How to trigger auto-debug and self-healing: local CLI, platform (GitHub + Control Plane), and graph-driven decision loop."
        />
        <p className="text-body-small text-text-secondary mb-4">
          To give Cursor a <strong>repeatable entrypoint</strong> (debug bundle + commands instead of &quot;check the logs&quot;), see{" "}
          <Link href="/operator-guide" className="text-brand-600 hover:underline">Operator guide</Link>.
        </p>
        <CardSection title="Graph & deploy observability">
          <p className="text-body-small text-text-secondary mb-2">
            The platform can observe KPIs, detect anomalies, and run a <strong>decision loop</strong> (observe → diagnose → decide → act → learn).
            Deploy and build outcomes are tracked so repair plans and similar incidents are available.
          </p>
          <ul className="list-disc list-inside space-y-1 text-body-small text-text-secondary mb-2">
            <li><Link href="/graph/decision-loop" className="text-brand-600 hover:underline">Decision loop</Link> — Run a tick, compute baselines, view anomalies; optional auto-act (e.g. open_incident).</li>
            <li><Link href="/graph/deploys" className="text-brand-600 hover:underline">Deploy events</Link> — List builds; sync from Render or GitHub Actions; open a deploy to see repair plan and suggested file actions.</li>
            <li><Link href="/graph/import-graph" className="text-brand-600 hover:underline">Import graph</Link> — Per-service module graph used for deploy repair (e.g. missing file → files to commit).</li>
            <li><Link href="/graph/memory" className="text-brand-600 hover:underline">Memory (incidents)</Link> — Incident resolutions used by the decision loop and repair planning.</li>
          </ul>
        </CardSection>
        <CardSection title="1. Local (repo on your machine)">
          <p className="text-body-small text-text-secondary mb-2">
            Run in the AI Factory repo root with <code className="bg-surface-sunken px-1 rounded">OPENAI_API_KEY</code> set:
          </p>
          <pre className="bg-surface-sunken rounded-lg p-4 text-body-small overflow-x-auto">
            npm run self-heal
          </pre>
          <p className="text-body-small text-text-secondary mt-2">
            This runs doctor → parses errors → LLM suggests patches → applies and re-runs. Use{" "}
            <code className="bg-surface-sunken px-1 rounded">npm run self-heal:dry</code> to preview, or{" "}
            <code className="bg-surface-sunken px-1 rounded">npm run self-heal:tsc</code> to only fix TypeScript.
          </p>
        </CardSection>
        <CardSection title="2. Platform (GitHub + Control Plane)">
          <p className="text-body-small text-text-secondary mb-2">
            To have the platform create a self-heal initiative and run a fix plan:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-body-small text-text-secondary">
            <li>In Render, set <code className="bg-surface-sunken px-1 rounded">ENABLE_SELF_HEAL=true</code> for the Control Plane service.</li>
            <li>In GitHub, add a webhook: Payload URL = <code className="bg-surface-sunken px-1 rounded">https://&lt;your-control-plane-url&gt;/v1/webhooks/github</code>, events = Issues + Pull requests.</li>
            <li>Add the <strong>fix-me</strong> label to an issue or PR. The webhook creates an initiative and plan; runners (when connected) can execute the fix and open a PR.</li>
          </ol>
          <p className="text-body-small text-text-secondary mt-3">
            Full steps and gating policy: <code className="bg-surface-sunken px-1 rounded">docs/SELF_HEAL_HOW_TO_TRIGGER.md</code> in the repo.
          </p>
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
