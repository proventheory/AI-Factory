# Building new pipelines (email, SEO, ads, or any)

When the user (or the codebase) is **adding or extending a pipeline**—new job types, new handlers, new artifact types, or new intent types for email, SEO, ads, or other domains—follow the canonical checklist so no steps are skipped.

## Mandatory reference

- **Read and apply:** [docs/HOW_TO_BUILD_NEW_PIPELINES.md](../../docs/HOW_TO_BUILD_NEW_PIPELINES.md)

That doc is the single source of truth. It covers:

1. **Runner:** handler + job_type registration in `runners/src/handlers/index.ts`; record artifact consumption.
2. **Artifact hygiene:** Any path that sends artifact body to an LLM must use `loadArtifactContentForLlm` or `loadPredecessorContentsForLlm` from `runners/src/artifact-content.ts`. See also [docs/ARTIFACT_HYGIENE.md](../../docs/ARTIFACT_HYGIENE.md).
3. **Capability graph:** New artifact types and operators in seed/migration; `operator_produces_artifact_type` and `operator_consumes_artifact_type` edges so the resolver works.
4. **Lineage:** Record consumption when handlers read predecessor artifacts; set producer on write.
5. **Migrations (self-heal on deploy):** New `supabase/migrations/*.sql` must be added to `scripts/run-migrate.mjs` in the same change; `npm run verify:migrations` runs in CI. The Control Plane runs every migration in that list on every start—so only migrations registered there are applied on deploy. If you skip this, the new wizard/pipeline will hit "relation does not exist" after deploy.
6. **Docs:** Update job contracts (e.g. `docs/wp-shopify-migration/job-contracts.md`) and `docs/ARTIFACT_HYGIENE.md` (where artifact content reaches the LLM, or paths that do not build prompts).
7. **Runbook:** Gate B in [docs/runbooks/large-deploy-verification.md](../../docs/runbooks/large-deploy-verification.md) after deploy.

## Do not skip

- Do not add a handler that puts raw artifact body into an LLM prompt without the artifact-content helpers.
- Do not add a new migration file without adding it to `run-migrate.mjs`.
- Do not add a new job_type or artifact_type without updating the capability graph seed so the resolver and by-artifact-type flows work.

When in doubt, open [docs/HOW_TO_BUILD_NEW_PIPELINES.md](../../docs/HOW_TO_BUILD_NEW_PIPELINES.md) and walk the checklist.
