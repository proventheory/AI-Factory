# Runbook: Migration workflow

Before and after applying schema migrations (including artifact_consumption, capability graph, and any new `supabase/migrations/*.sql`).

---

## Before (same PR as migration code)

1. **Register migration:** Every new file under `supabase/migrations/*.sql` must be added to the `migrations` array in `scripts/run-migrate.mjs`. See [CONTRIBUTING.md](../../CONTRIBUTING.md).
2. **CI:** Run `npm run verify:migrations`. Fails if any migration file is missing from run-migrate.
3. **No raw artifact body in LLM:** If your change touches code that loads artifact content for an LLM, use `loadArtifactContentForLlm` from `runners/src/artifact-content.ts`.

---

## Apply

- **Control Plane / shared DB:**  
  `DATABASE_URL=<url> npm run db:migrate`  
  (Or use the same `DATABASE_URL` as Render api-staging/runner-staging and run from your machine; or let the **runner** run migrations on its next startup.)

- **Runner:** On startup, the runner runs `scripts/run-migrate.mjs` against its `DATABASE_URL`. So after you deploy a new runner image that includes new migrations in run-migrate, the next runner start will apply them.

---

## After (post-migration audit)

- **Console "relation does not exist":** If the Console points at the same DB, run migrations as above. See [console-db-relation-does-not-exist.md](console-db-relation-does-not-exist.md).
- **Large deploy (artifact_consumption, capability graph):** Use [large-deploy-verification.md](large-deploy-verification.md): tables present, runner migrate→start, lineage API, capability resolver, capability loop. This is **Gate B** for the graph engine.

---

See also: [OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md), [GRAPH_ENGINE_IMPLEMENTATION_STATUS.md](../GRAPH_ENGINE_IMPLEMENTATION_STATUS.md).
