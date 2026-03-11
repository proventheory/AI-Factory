# How the AI Factory Fits Together

One-page overview so the structure is easy to grasp.

---

## The three pieces

| Piece | What it is | Where it runs |
|-------|------------|----------------|
| **Console** (ProfessorX) | The UI you’re in: initiatives, plans, runs, cost dashboard, graph, brands, etc. | Vercel (this app) |
| **Control Plane** | Backend API + scheduler. Handles initiatives, plans, runs, LLM usage, launches, Klaviyo, etc. Talks to Postgres. | Render (or your container host) |
| **Runners** | Workers that run pipeline jobs (email generation, copy, deploys, etc.). Get work from Control Plane, write results to DB/artifacts. | Render / your fleet |

---

## Request flow (simple)

```
You (browser)  →  Console (Vercel)  →  Control Plane API (Render)  →  Postgres
                       ↓
                NEXT_PUBLIC_CONTROL_PLANE_API
```

- Every page in the Console that shows data (initiatives, runs, cost dashboard, etc.) calls the **Control Plane** API.
- The Control Plane reads/writes **Postgres** (same DB for both Control Plane and Runners).
- **Runners** are triggered by the Control Plane (e.g. when you “Run” a plan); they don’t talk to the Console.

---

## Database

- **One Postgres** (e.g. Supabase or Render Postgres) used by:
  - Control Plane (initiatives, plans, runs, artifacts, llm_calls, build_specs, launches, …)
  - Runners (job state, logs, artifact refs)
- **Migrations** must be run against that DB so the schema exists. If you see `relation "initiatives" does not exist`, the DB the Control Plane uses hasn’t had migrations applied.
  - Run: `DATABASE_URL=<that_db_url> npm run db:migrate`
  - See [runbooks/console-db-relation-does-not-exist.md](runbooks/console-db-relation-does-not-exist.md).

---

## Menu and “leaving the platform”

- Every nav item (Initiatives, Klaviyo, Launches, Graph Explorer, etc.) is a **route inside the same Console app**.
- Each of these routes has a **layout that wraps the page with the sidebar (AppShell)** so the menu never disappears when you click a link.
- If the menu ever disappears, it’s a bug (missing layout or an error that replaces the whole page); the app is built so that doesn’t happen.

---

## What lives where (quick ref)

| You want to… | Where to go |
|--------------|-------------|
| Create/manage initiatives, plans, runs | **ORCHESTRATION** → Initiatives, Plans, Pipeline Runs |
| Email campaigns, push to Klaviyo | **ORCHESTRATION** → Email Design Generator, Klaviyo |
| Launches (build specs, deploy preview) | **ORCHESTRATION** → Launches |
| See LLM cost / usage | **DASHBOARD** → Cost Dashboard |
| Graph / deploys / repair | **ORCHESTRATION** → Graph Explorer, Deploy events, etc. |
| Brands, templates, tokens | **BRAND & DESIGN** → Brands, Document Templates, Token Registry |
| Policies, budgets, adapters | **CONFIG** → Policies, LLM Budgets, Adapters |
| Health, analytics, incidents | **MONITORING** / **OTHER** |

---

## Deploy checklist

1. **DB:** Run migrations on the DB the Control Plane uses (`npm run db:migrate` with that `DATABASE_URL`).
2. **Control Plane:** Deploy from a commit that has the API routes you need (e.g. `/v1/launches`, `/v1/initiatives`). Restart after DB migrations.
3. **Console:** Deploy from a commit that has the layouts and nav you expect (Vercel usually auto-deploys on push).
4. **Env:** Console needs `NEXT_PUBLIC_CONTROL_PLANE_API` pointing at the deployed Control Plane URL.

See [ENABLEMENT_ENV_VARS.md](ENABLEMENT_ENV_VARS.md) and [STACK_AND_DECISIONS.md](STACK_AND_DECISIONS.md) for more.
