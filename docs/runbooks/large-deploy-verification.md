# Large deploy verification (artifact_consumption, capability graph, self-heal)

Use this checklist after deploying changes that add **artifact_consumption**, **capability graph** (operators, artifact_types, resolver), and related self-heal/migration behavior.

## Pre-deploy

- [ ] Every new migration is listed in `scripts/run-migrate.mjs` in the same PR as the code that uses it.
- [ ] `npm run verify:migrations` passes (every path in run-migrate exists on disk).
- [ ] **Trigger deploy:** From **repo root**, run `node scripts/render-trigger-deploy.mjs --staging` (or `node --env-file=.env scripts/render-trigger-deploy.mjs --staging`). Scripts load `RENDER_API_KEY` from **`.env`** automatically when cwd is repo root. Use `--staging --clear` to clear build cache. **Agents:** Do not say "RENDER_API_KEY is not set" without running from repo root with `.env` present; use MCP (Render) or the script with env loaded.

**Wait for deploy, then run full migrate (recommended):** The runner runs `run-migrate.mjs` on startup, but to ensure the **shared DB** has all tables before or right after the new API/runner are live, (1) trigger deploy as above, (2) wait for deploy to complete (e.g. use Render MCP `list_deploys` for each service until `status` is `live`, or wait ~5–10 minutes), (3) from repo root run **full migrate:** `node --env-file=.env scripts/run-migrate.mjs`. This completes all migrations (including artifact_consumption, capability_graph) so the API and runner see the same schema. If you run migrate before deploy, the DB is ready when the new containers start; if you run after, you ensure nothing was missed.

## Post-deploy verification

- [ ] **New tables exist**  
  `artifact_consumption` and capability graph tables (`operators`, `artifact_types`, `operator_produces_artifact_type`, etc.) exist.  
  Example: `SELECT 1 FROM artifact_consumption LIMIT 1` (no 42P01).

- [ ] **Runner: migrate then start**  
  Runner log shows migrations running then "Runner started"; no 42P01 on startup.

- [ ] **Self-heal redeploy (optional but recommended)**  
  On at least one representative failure path: deploy-failure scan triggers redeploy; next deploy runs migrate then start. See [SELF_HEAL_HOW_TO_TRIGGER.md](../SELF_HEAL_HOW_TO_TRIGGER.md) for the two failure classes (deploy/startup vs runtime/schema mismatch).

- [ ] **Lineage API**  
  `GET /v1/graph/lineage/:artifactId` returns real data (declared_producer and/or observed_consumers when present).

- [ ] **Capability resolver**  
  `GET /v1/capability/resolve?produces=copy` returns `{ "operators": ["copy_generate"] }` (or expected list in deterministic order).

- [ ] **Capability loop**  
  One of: (a) `POST /v1/runs/by-artifact-type` with body `{ "produces": "copy" }` creates a run and plan with job_type from resolver; (b) or equivalent path (plan compiler using resolver) works. After runner executes, artifact is produced and lineage shows producer/consumption where applicable.

## Sign-off

| Check | Yes/No | Notes |
|------|--------|--------|
| New tables present | Yes | `artifact_consumption`, `operators`, `artifact_types` verified via DB query (run migrations from repo root with `.env` if missing). |
| Runner started after migrate | — | Runner runs `run-migrate.mjs` on startup; check Render runner logs for "Runner started" and no 42P01. |
| Self-heal redeploy verified (or N/A) | N/A | Optional. |
| Lineage API returns real data | — | `GET /v1/graph/lineage/:id` (requires existing artifact id). |
| Resolver returns expected operators | — | After deploy with latest API: `GET /v1/capability/resolve?produces=copy`. If 404, redeploy with `--staging --clear`. |
| Capability loop verified | — | `POST /v1/runs/by-artifact-type` then runner produces artifact. |

**Autonomous run:** From repo root, **`node --env-file=.env scripts/deploy-staging-and-migrate.mjs`** does deploy + wait + migrate in one shot. Alternatively: `node scripts/render-trigger-deploy.mjs --staging` then `node --env-file=.env scripts/run-migrate.mjs`. For **deploy-failure self-heal** to cover api + gateway + runner, set **RENDER_STAGING_SERVICE_IDS** on the Control Plane (see [STAGING_RENDER_CHECKLIST.md](../STAGING_RENDER_CHECKLIST.md)).

**Gaps fixed:** _(list any issues found and how they were fixed)_

---

See also: [SELF_HEAL_HOW_TO_TRIGGER.md](../SELF_HEAL_HOW_TO_TRIGGER.md) (large deploy and self-heal, two failure classes), [CAPABILITY_GRAPH.md](../CAPABILITY_GRAPH.md) (resolver and ranking).
