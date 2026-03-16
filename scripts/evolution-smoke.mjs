#!/usr/bin/env node
/**
 * Evolution Loop V1 smoke test: one proposal → one experiment → fitness + promotion decision.
 * See .cursor/plans/evolution_loop_v1_relevance_and_estimate_6a891ee9.plan.md Section 11 step 7.
 *
 * Usage:
 *   CONTROL_PLANE_API=http://localhost:3001 node scripts/evolution-smoke.mjs
 */
const API = process.env.CONTROL_PLANE_API ?? "http://localhost:3001";

async function main() {
  console.log("Control Plane API:", API);

  // 1. Health + evolution targets
  const healthRes = await fetch(`${API}/health`);
  if (!healthRes.ok) throw new Error(`Health failed: ${healthRes.status}`);
  console.log("Health: ok");

  const targetsRes = await fetch(`${API}/v1/evolution/targets`);
  if (!targetsRes.ok) {
    if (targetsRes.status === 404) {
      throw new Error(
        `Evolution targets failed: 404. The control plane may need a restart to load /v1/evolution routes (or run migrations).`
      );
    }
    throw new Error(`Evolution targets failed: ${targetsRes.status}`);
  }
  const { targets } = await targetsRes.json();
  console.log("Evolution targets:", targets?.length ?? 0);

  // 2. Create mutation proposal (deploy_repair, repair_recipe_order)
  const mutationBody = {
    domain: "deploy_repair",
    target_type: "repair_recipe_order",
    target_id: "default",
    mutation_kind: "reorder",
    patch: { order: ["rollback", "retry", "quarantine_escalate"] },
    baseline_snapshot: {},
    proposed_by: "evolution-smoke",
  };
  const mutRes = await fetch(`${API}/v1/evolution/mutations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mutationBody),
  });
  if (!mutRes.ok) {
    const text = await mutRes.text();
    throw new Error(`Create mutation failed: ${mutRes.status} ${text}`);
  }
  const mutation = await mutRes.json();
  console.log("Created mutation:", mutation.id, mutation.status);

  // 3. Create experiment run (queued; runner may pick it up)
  const expBody = {
    mutation_proposal_id: mutation.id,
    domain: "deploy_repair",
    baseline_ref: {},
    candidate_ref: mutation.patch,
    traffic_strategy: "replay",
    cohort_key: "smoke",
    cohort_filters: {},
  };
  const expRes = await fetch(`${API}/v1/evolution/experiments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expBody),
  });
  if (!expRes.ok) {
    const text = await expRes.text();
    throw new Error(`Create experiment failed: ${expRes.status} ${text}`);
  }
  const experiment = await expRes.json();
  console.log("Created experiment:", experiment.id, experiment.status);

  // 4. Record promotion decision (simulate post-replay decision)
  const decideBody = {
    decided_by: "evolution-smoke",
    score_delta: 0.1,
    baseline_regression: false,
    metric_summary: { resolved_count: 1, repair_success_count: 1 },
  };
  const decideRes = await fetch(`${API}/v1/evolution/experiments/${experiment.id}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(decideBody),
  });
  if (!decideRes.ok) {
    const text = await decideRes.text();
    throw new Error(`Decide failed: ${decideRes.status} ${text}`);
  }
  const decision = await decideRes.json();
  console.log("Recorded promotion decision:", decision.decision, decision.decided_at);

  console.log("\nEvolution smoke: one proposal → one experiment → one promotion decision. OK.");
  console.log("  Mutations: /evolution/mutations");
  console.log("  Experiments: /evolution/experiments");
  console.log("  Scoreboard: /evolution/scoreboard");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
