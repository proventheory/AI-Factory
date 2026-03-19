# Contributing to AI Factory

## Migrations

- **New migrations must be registered in the same PR.** Every file in `supabase/migrations/*.sql` that should run on deploy must be in the `migrations` array in `scripts/run-migrate.mjs`. A few files are intentionally not run (core schema comes from `schemas/001` and `002`); those are listed in `SKIP_NOT_IN_RUN_MIGRATE` in `scripts/verify-migrations-registered.mjs` so CI passes. See [docs/MIGRATIONS.md](docs/MIGRATIONS.md).
- **CI:** `npm run verify:migrations` must pass before pushing. Run it before every PR that adds or changes migrations.

## Artifact content and LLM context

- **No raw artifact body in LLM prompts.** Any path that may serialize artifact body into model context (prompt builders, evaluator prompts, validator prompts, comparison prompts, repair prompts) must use the helper `loadArtifactContentForLlm` from `runners/src/artifact-content.ts`. Bypasses are bugs.
- Code review: when adding or changing code that loads artifact content for an LLM, confirm it uses `loadArtifactContentForLlm` (or does not pass artifact body to the model).

## Kernel vs vertical

- **Do not add domain meaning to the kernel.** Before adding any new shared table or shared control-plane concept, see [docs/KERNEL_SUBSTRATE.md](docs/KERNEL_SUBSTRATE.md). If it is domain meaning (e.g. SEO clusters, incident state, repair strategy), it belongs in a vertical (e.g. `control-plane/src/verticals/*`) with vertical-scoped migrations, not in the platform kernel.

## Repo hygiene

- **Do not commit build artifacts.** `dist/` is in `.gitignore`; keep it that way. When packaging the repo (e.g. zip for audit), exclude `dist/`, `node_modules/`, and `.env`. The top-level `https:` directory is an accidental URL-as-path artifact; it is gitignored; remove it from the working tree if present (`rm -rf 'https:'`).
- **Control Plane API size.** `control-plane/src/api.ts` is large; new routes should go into domain routers per [docs/REFACTOR_API_PLAN.md](docs/REFACTOR_API_PLAN.md). Do not add new route handlers directly to api.ts for new domains.

## Plan and RFC drift

- If schema, route shape, ranking policy, or state transitions change during implementation, update the relevant RFC and TODO in the **same PR**. Done means merged docs match code.
