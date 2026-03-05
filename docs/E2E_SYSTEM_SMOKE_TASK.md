# E2E System Smoke Task: What It Is, Goal, and How to Run It

## The task

**Name:** ProfessorX full-system smoke test  
**Goal:** Exercise the full stack (Control Plane API → Postgres) and confirm that data appears in the ProfessorX Console, so we know the system is wired end-to-end.

## What the script does

1. **Health check** — `GET /health` → confirms Control Plane is up.
2. **Create initiative** — `POST /v1/initiatives` with `intent_type: "software"`, title `"E2E smoke: ProfessorX full-system test"`, `risk_level: "low"`. This writes to Postgres.
3. **Compile plan** — `POST /v1/initiatives/:id/plan` with `x-role: operator`. On staging this can return 500 if the DB doesn’t have `goal_state` (or the plan-compiler fix isn’t deployed yet); the script treats that as non-fatal.
4. **Optional brand** — `POST /v1/brand_profiles`; may fail on some DBs (non-fatal).
5. **List initiatives and plans** — sanity check that list endpoints work.

## How to run it

```bash
CONTROL_PLANE_API=https://ai-factory-api-staging.onrender.com node scripts/e2e-system-smoke.mjs
```

Or against local Control Plane:

```bash
CONTROL_PLANE_API=http://localhost:3001 node scripts/e2e-system-smoke.mjs
```

## What we ran and what happened

- **API:** `https://ai-factory-api-staging.onrender.com`
- **Health:** OK
- **Initiative:** Created (e.g. id `dd063649-5aa5-44d7-9e60-3c9baa145e6c`, title "E2E smoke: ProfessorX full-system test")
- **Plan compile:** 500 on staging (`column "goal_state" does not exist`) — plan compiler was selecting columns added in migration 000005; the codebase now has a fix (plan-compiler selects only core columns). After you **deploy** that change, plan compile should succeed.
- **Brand create:** 500 on staging (likely missing column or table; non-fatal)
- **Lists:** Initiatives and plans list endpoints returned OK

## Verify in the Console

1. Open the ProfessorX Console (e.g. https://ai-factory-console-git-main-proventheorys-projects.vercel.app/ — log in if required).
2. Go to **Initiatives** (`/initiatives`). You should see **"E2E smoke: ProfessorX full-system test"**.
3. If plan compile succeeded (after deploy), go to **Plans** (`/plans`) and you should see a plan for that initiative with 5 nodes (software template).
4. Check **Dashboard** (`/dashboard`) for counts and links.

## Making plan compile succeed on staging

- **Option A:** Deploy the current `main` (plan-compiler now uses only core columns in `loadInitiative`), then re-run the smoke; plan compile should return 201.
- **Option B:** Run the multi_framework migration (000005) on the staging DB so `initiatives` has `goal_state`, etc. Then the old plan-compiler would work too.

## Summary

| Step           | Goal                         | Result (staging run)     |
|----------------|------------------------------|---------------------------|
| Health         | Control Plane reachable      | OK                        |
| Create initiative | Row in DB, visible in UI | Created                   |
| Compile plan   | Plan + nodes in DB           | 500 until fix deployed    |
| List initiatives/plans | Read path works      | OK                        |
| Verify in Console | Human sees initiative   | Log in and open /initiatives |

The task is: **create an initiative (and optionally a plan) via the API and confirm it shows up in ProfessorX.** The script automates the API side; you verify in the browser after logging in.
