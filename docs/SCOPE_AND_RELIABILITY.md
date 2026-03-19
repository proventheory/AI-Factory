# Scope, ambition, and reliability

The repo spans many domains at once: workflow orchestration, graph runtime, marketing ops, SEO, brand catalog, deploy healing, incident memory, evolution loop, operator registry, flows, launch specs. That power creates a real risk: **the meta-system can become more sophisticated as a control-theory artifact than as a dependable production product.**

## Guardrails

- **Prioritize reliability over new surface.** When in doubt, fix observability, migrations, and runbooks before adding new verticals or features. A smaller, stable surface beats a larger, brittle one.
- **One source of truth for schema.** Migrations must be registered and verified (`npm run verify:migrations`). No ad-hoc SQL or "run this once" scripts that diverge from `run-migrate.mjs`. See [MIGRATIONS.md](MIGRATIONS.md).
- **API structure.** Keep the Control Plane API maintainable: extract domain routers per [REFACTOR_API_PLAN.md](REFACTOR_API_PLAN.md); avoid further growth of the single api.ts file.
- **Repo hygiene.** Don’t commit `dist/` or other build artifacts; keep the repo free of accidental URL-as-path directories and one-off clutter. See CONTRIBUTING § Repo hygiene.

## When adding new domains

Ask: (1) Is this essential for a current product outcome, or "nice to have" for the meta-system? (2) Can it live in a vertical with clear boundaries and its own migrations? (3) Do we have runbooks and verification for the existing surface before we add more? Prefer deepening reliability of existing flows over broadening into new ones unless there is a clear product need.
