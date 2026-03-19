#!/usr/bin/env node
/**
 * Smoke test for refactored Control Plane API.
 * Run with Control Plane up: node --env-file=.env scripts/api-refactor-smoke.mjs
 * Uses BASE_URL from env or http://localhost:3001.
 */

const BASE = process.env.BASE_URL || process.env.CONTROL_PLANE_URL || "http://localhost:3001";

const ROUTES = [
  { path: "/health", expectStatus: [200] },
  { path: "/health/db", expectStatus: [200, 503] },
  { path: "/v1/health", expectStatus: [200] },
  { path: "/v1/dashboard", expectStatus: [200, 500] },
  { path: "/v1/usage", expectStatus: [200, 500] },
  { path: "/v1/policies", expectStatus: [200, 500] },
  { path: "/v1/initiatives", expectStatus: [200, 500] },
  { path: "/v1/plans", expectStatus: [200, 500] },
  { path: "/v1/audit", expectStatus: [200, 500] },
  { path: "/v1/analytics", expectStatus: [200, 500] },
];

async function main() {
  console.log(`Smoke testing Control Plane at ${BASE}\n`);
  let failed = 0;
  for (const { path, expectStatus } of ROUTES) {
    const url = `${BASE}${path}`;
    try {
      const res = await fetch(url, { method: "GET" });
      const ok = expectStatus.includes(res.status);
      if (!ok) {
        console.log(`FAIL ${path} → ${res.status} (expected ${expectStatus.join("/")})`);
        failed++;
      } else {
        console.log(`OK   ${path} → ${res.status}`);
      }
    } catch (e) {
      console.log(`ERR  ${path} → ${e.message}`);
      failed++;
    }
  }
  console.log("");
  if (failed > 0) {
    console.log(`${failed} check(s) failed. Ensure Control Plane is running and BASE_URL is correct.`);
    process.exit(1);
  }
  console.log("All smoke checks passed.");
  process.exit(0);
}

main();
