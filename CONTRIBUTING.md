# Contributing to AI Factory

## Migrations

- **New migrations must be registered in the same PR.** Every file in `supabase/migrations/*.sql` must be listed in the `migrations` array in `scripts/run-migrate.mjs`. The runner runs migrations on every startup; unregistered migrations are not applied.
- **CI enforces this:** `npm run verify:migrations` fails if any migration file is missing from `run-migrate.mjs`. Run it before pushing.

## Artifact content and LLM context

- **No raw artifact body in LLM prompts.** Any path that may serialize artifact body into model context (prompt builders, evaluator prompts, validator prompts, comparison prompts, repair prompts) must use the helper `loadArtifactContentForLlm` from `runners/src/artifact-content.ts`. Bypasses are bugs.
- Code review: when adding or changing code that loads artifact content for an LLM, confirm it uses `loadArtifactContentForLlm` (or does not pass artifact body to the model).

## Plan and RFC drift

- If schema, route shape, ranking policy, or state transitions change during implementation, update the relevant RFC and TODO in the **same PR**. Done means merged docs match code.
