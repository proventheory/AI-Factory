#!/usr/bin/env node
/**
 * End-to-end system smoke: create initiative → compile plan → (optional) brand.
 * Call Control Plane API, then you can verify in ProfessorX Console.
 *
 * Usage:
 *   CONTROL_PLANE_API=https://ai-factory-api-staging.onrender.com node scripts/e2e-system-smoke.mjs
 *
 * Goal: Exercise the full stack (API → DB) and confirm data appears in the Console.
 */
const API = process.env.CONTROL_PLANE_API ?? "https://ai-factory-api-staging.onrender.com";

async function main() {
  console.log("Control Plane API:", API);

  // 1. Health check
  const healthRes = await fetch(`${API}/health`);
  if (!healthRes.ok) {
    throw new Error(`Health check failed: ${healthRes.status} ${await healthRes.text()}`);
  }
  const health = await healthRes.json();
  console.log("Health:", health);

  // 2. Create initiative (core columns only so it works on all DBs)
  const initBody = {
    intent_type: "software",
    title: "E2E smoke: ProfessorX full-system test",
    risk_level: "low",
    created_by: "e2e-system-smoke",
  };
  const initRes = await fetch(`${API}/v1/initiatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(initBody),
  });
  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`Create initiative failed: ${initRes.status} ${text}`);
  }
  const initiative = await initRes.json();
  console.log("Created initiative:", initiative.id, initiative.title);

  // 3. Compile plan for initiative (requires operator+ role)
  let plan = null;
  const planRes = await fetch(`${API}/v1/initiatives/${initiative.id}/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": "operator" },
    body: JSON.stringify({}),
  });
  if (planRes.ok) {
    plan = await planRes.json();
    console.log("Compiled plan:", plan.id, "nodes:", plan.nodes);
  } else {
    const text = await planRes.text();
    console.log("Plan compile failed (non-fatal):", planRes.status, text);
  }

  // 4. Optional: create a brand (if brand_profiles exists)
  let brandId = null;
  const brandRes = await fetch(`${API}/v1/brand_profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "E2E Smoke Brand",
      slug: "e2e-smoke-brand",
      design_tokens: { colors: { brand: { "500": "#3b82f6" } } },
    }),
  });
  if (brandRes.ok) {
    const brand = await brandRes.json();
    brandId = brand.id;
    console.log("Created brand:", brand.id, brand.name);
  } else {
    console.log("Brand create skipped or failed (non-fatal):", brandRes.status);
  }

  // 5. List initiatives and plans (sanity)
  const listInit = await fetch(`${API}/v1/initiatives?limit=3`);
  const listPlan = await fetch(`${API}/v1/plans?limit=3`);
  console.log("Initiatives list ok:", listInit.ok);
  console.log("Plans list ok:", listPlan.ok);

  // 6. Klaviyo list endpoints (routes exist; may 200 with empty items or 500 if tables missing)
  const klaviyoTemplates = await fetch(`${API}/v1/klaviyo/templates`);
  const klaviyoCampaigns = await fetch(`${API}/v1/klaviyo/campaigns`);
  const klaviyoFlows = await fetch(`${API}/v1/klaviyo/flows`);
  console.log("Klaviyo templates list ok:", klaviyoTemplates.ok);
  console.log("Klaviyo campaigns list ok:", klaviyoCampaigns.ok);
  console.log("Klaviyo flows list ok:", klaviyoFlows.ok);
  if (!klaviyoTemplates.ok) console.log("  (Klaviyo tables may not be migrated yet; run 20250330000000_* and 20250330000002_*)");

  console.log("\n--- Done. Verify in ProfessorX Console ---");
  console.log("  Initiatives: /initiatives (should see \"E2E smoke: ProfessorX full-system test\")");
  if (plan) console.log("  Plans:       /plans (should see plan with", plan.nodes, "nodes)");
  if (brandId) console.log("  Brands:      /brands (should see \"E2E Smoke Brand\")");
  console.log("  Dashboard:   /dashboard");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
