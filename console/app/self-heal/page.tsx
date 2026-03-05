"use client";

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
          description="How to trigger auto-debug and self-healing."
        />
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
