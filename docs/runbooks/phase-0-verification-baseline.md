# Phase 0: Verification baseline (self-heal and runner migrations)

Use this checklist before implementing artifact hygiene, artifact_consumption, and capability graph. No code changes required; confirms the baseline the rest of the plan builds on.

## Checklist

- [ ] **Runner migrations on startup**  
  `Dockerfile.runner` runs `node scripts/run-migrate.mjs && exec node dist/runner-bundle.js`. In `scripts/run-migrate.mjs`, all current migrations used by the runner are listed (including `20250315000000_graph_self_heal_tables.sql`). Run `npm run verify:migrations` to ensure every path in run-migrate exists.

- [ ] **Deploy-failure self-heal**  
  Control Plane runs the deploy-failure scan every 5 min. On worker deploy failed/canceled it triggers redeploy with cache clear. After 2 redeploys per commit it creates an initiative and stops. Code: `control-plane/src/deploy-failure-self-heal.ts`, `control-plane/src/index.ts`.

- [ ] **Console/Vercel deploy_events**  
  POST `/v1/deploy_events` with `status: "failed"` and `service_id` containing `vercel` or `console`, and `ENABLE_SELF_HEAL=true`, creates a self-heal initiative and compiles a plan. Code: `control-plane/src/api.ts` (deploy_events handler).

- [ ] **Docs**  
  [docs/SELF_HEAL_HOW_TO_TRIGGER.md](../SELF_HEAL_HOW_TO_TRIGGER.md) describes: runner migrations on startup, deploy-failure scan, repeated-failure cap, and Console/Vercel deploy_events.

## Sign-off

When all four items are confirmed, the baseline is verified. Proceed to Phase 1 (artifact hygiene).
