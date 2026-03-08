#!/usr/bin/env node
/**
 * Test the generate flow against the control-plane API:
 * POST /v1/email_designs (create email design) -> POST .../plan -> POST .../start
 * Fails fast with clear errors. Use with CONTROL_PLANE_URL or default localhost:3001.
 */

const API = process.env.CONTROL_PLANE_URL || process.env.NEXT_PUBLIC_CONTROL_PLANE_API || "http://localhost:3001";

async function request(method, path, body = null) {
  const url = `${API.replace(/\/$/, "")}${path}`;
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.raw || `HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

async function main() {
  console.log("Control-plane API:", API);

  // 1. Create email campaign (include risk_level: "medium" to prove we ignore it)
  const campaign = await request("POST", "/v1/email_designs", {
    title: "Test campaign",
    risk_level: "medium",
    metadata_json: { products: [], campaign_prompt: "test" },
  });
  const initiativeId = campaign.id;
  if (!initiativeId) throw new Error("No campaign id in response: " + JSON.stringify(campaign));
  console.log("Created campaign (initiative):", initiativeId);

  // 2. Compile plan
  const planRes = await request("POST", `/v1/initiatives/${initiativeId}/plan`, {});
  const planId = planRes.id;
  if (!planId) throw new Error("No plan id: " + JSON.stringify(planRes));
  console.log("Compiled plan:", planId);

  // 3. Start run
  const startRes = await request("POST", `/v1/plans/${planId}/start`, {
    environment: "sandbox",
    llm_source: "gateway",
  });
  const runId = startRes.id;
  if (!runId) throw new Error("No run id: " + JSON.stringify(startRes));
  console.log("Started run:", runId);

  console.log("Generate flow OK. Initiative:", initiativeId, "Plan:", planId, "Run:", runId);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
