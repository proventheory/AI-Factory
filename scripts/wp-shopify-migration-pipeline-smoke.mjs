#!/usr/bin/env node
/**
 * Smoke-test WP → Shopify migration API + runner self-heal env hints (no secrets in repo).
 *
 * Usage:
 *   CONTROL_PLANE_URL=https://api.example.com BRAND_ID=<uuid> node scripts/wp-shopify-migration-pipeline-smoke.mjs
 *
 * Optional:
 *   WOO_SERVER WOO_CONSUMER_KEY WOO_CONSUMER_SECRET — if set, enqueues a dry_run (fast) instead of health-only.
 */

const base = (process.env.CONTROL_PLANE_URL || "http://localhost:3001").replace(/\/$/, "");
const brandId = process.env.BRAND_ID?.trim();

async function getJson(path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  console.log("CONTROL_PLANE_URL:", base);

  let health;
  try {
    health = await getJson("/health");
  } catch (e) {
    const code = e?.cause?.code ?? e?.code;
    if (code === "ECONNREFUSED") {
      console.warn("[smoke] Control plane not reachable (ECONNREFUSED). Start it: npm run dev:control-plane");
      printSelfHealHint();
      process.exit(0);
    }
    throw e;
  }
  console.log("/health:", health.status, typeof health.body === "object" ? JSON.stringify(bodySummary(health.body)) : String(health.body));

  printSelfHealHint();

  if (!brandId) {
    console.log("BRAND_ID not set — skipping dry_run enqueue. Set BRAND_ID to test POST /v1/wp-shopify-migration/dry_run.");
    process.exit(health.ok ? 0 : 1);
  }

  const woo =
    process.env.WOO_SERVER?.trim() &&
    process.env.WOO_CONSUMER_KEY?.trim() &&
    process.env.WOO_CONSUMER_SECRET?.trim();

  if (!woo) {
    console.log("Woo env incomplete — skipping dry_run. Set WOO_SERVER, WOO_CONSUMER_KEY, WOO_CONSUMER_SECRET for a full enqueue test.");
    process.exit(health.ok ? 0 : 1);
  }

  const dry = await getJson("/v1/wp-shopify-migration/dry_run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand_id: brandId,
      entities: ["blogs", "pdfs"],
      environment: process.env.PIPELINE_ENVIRONMENT || "staging",
      woo_server: process.env.WOO_SERVER.trim(),
      woo_consumer_key: process.env.WOO_CONSUMER_KEY.trim(),
      woo_consumer_secret: process.env.WOO_CONSUMER_SECRET.trim(),
    }),
  });
  console.log("POST /v1/wp-shopify-migration/dry_run:", dry.status, JSON.stringify(dry.body, null, 2));
  if (!dry.ok || !dry.body?.run_id) {
    process.exit(1);
  }

  const runId = dry.body.run_id;
  const deadline = Date.now() + 120_000;
  let status = "unknown";
  while (Date.now() < deadline) {
    const st = await getJson(`/v1/runs/${runId}`);
    status = st.body?.run?.status ?? "unknown";
    console.log(`GET /v1/runs/${runId.slice(0, 8)}… status=${status}`);
    if (["succeeded", "failed", "rolled_back"].includes(status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (status !== "succeeded") {
    console.error("Run did not succeed within timeout:", status);
    process.exit(1);
  }
  console.log("Smoke OK: dry_run pipeline completed.");
}

function printSelfHealHint() {
  const selfHeal = {
    ENABLE_SELF_HEAL: process.env.ENABLE_SELF_HEAL,
    RENDER_API_KEY_set: Boolean(process.env.RENDER_API_KEY?.trim()),
    RENDER_WORKER_SERVICE_ID: process.env.RENDER_WORKER_SERVICE_ID || "(unset)",
    RENDER_STAGING_SERVICE_IDS: process.env.RENDER_STAGING_SERVICE_IDS ? "(set)" : "(unset)",
  };
  console.log("Runner self-heal debug (local env — compare to Render worker env):", JSON.stringify(selfHeal, null, 2));
  if (process.env.ENABLE_SELF_HEAL === "true" && !process.env.RENDER_API_KEY?.trim()) {
    console.warn("[smoke] ENABLE_SELF_HEAL=true but RENDER_API_KEY missing — deploy-failure scan will no-op.");
  }
}

function bodySummary(body) {
  if (!body || typeof body !== "object") return body;
  const out = { ...body };
  for (const k of Object.keys(out)) {
    if (/key|secret|token|password/i.test(k) && typeof out[k] === "string") out[k] = "[redacted]";
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
