# Lifeboat Runbook (Plan §2.5, §16.1)

How to trigger and execute rollback when the system is degraded. Manual fallback so the factory can recover without the full system.

## When to use

- Canary or new release is causing failures and auto-rollback did not run or is insufficient.
- Control Plane or runners are unreachable or misbehaving.
- You need to restore a last-known-good state quickly.

## Prerequisites

- Access to the same database the Control Plane uses (`DATABASE_URL`).
- Access to release/routing configuration (e.g. `releases`, `release_routes` tables or Control Plane env).
- Optional: Git tag or branch of the last-known-good Control Plane / runner version.

---

## 1. Last-known-good branch/tag

- **Identify:** In Git, tag or note the commit that was at 100% and stable before the bad canary (e.g. `v1.2.3-stable` or `main` at commit `abc123`).
- **Use:** For Control Plane or runner, redeploy from that tag/branch so code and config match a known-good state.

---

## 2. Manual Control Plane redeploy

- **Render / Fly / K8s:** Redeploy the Control Plane service from the last-known-good image or Git ref.
- **Env:** Ensure `DATABASE_URL` and any vault/secret URLs point to the same DB and secrets as before.
- **Migrations:** Control Plane typically runs migrations on startup (`scripts/run-migrate.mjs`). If you need to avoid a new migration, run from a version that does not include it, or run migrations manually and then deploy.

---

## 3. Trigger rollback (database / API)

### Option A — Via API (if Control Plane is up)

- **Rollback a run’s release:**  
  `POST /v1/runs/:run_id/rollback`  
  (run_id = any run that used the bad release in that environment.)

- **Disable canary in data:**  
  Update `release_routes` or `releases.percent_rollout` so no new runs go to the canary release:
  - Set `release_routes.active_to = now()` for the canary rule, or
  - Set `releases.percent_rollout = 0` and `releases.status = 'rolled_back'` for the bad release.

### Option B — Direct DB (if API is down or you prefer SQL)

- **Point traffic away from canary:**  
  - In `release_routes`: set `active_to = now()` for the canary `release_id` / environment so that rule stops applying.
  - Or in `releases`: `UPDATE releases SET status = 'rolled_back', percent_rollout = 0 WHERE id = '<canary_release_id>';`

- **Optional:** Create or update a release route so that 100% of traffic goes to the previous (last-known-good) release in that environment.

---

## 4. Verify

- **Runs:** New runs in that environment should be assigned to the last-known-good release (check `runs.release_id`, `runs.cohort`).
- **Health:** Control Plane `GET /health` and dashboard “Canary drift” should show no further regression from the bad release.
- **Workers:** Restart or scale runners if they were pinned to a bad image; ensure they use a good image/digest.

---

## 5. After recovery

- **Incident:** Document what happened and why (e.g. in incident_memory or an .mdd artifact).
- **Gates:** If the bad release skipped a gate (e.g. longer soak, mandatory canary), fix the pipeline so that gate is enforced (see Upgrade Initiative gates in the plan).

---

## Quick reference

| Step | Action |
|------|--------|
| 1 | Note last-known-good Git tag/branch and/or release_id. |
| 2 | Redeploy Control Plane from that ref if needed. |
| 3 | Disable canary: `release_routes.active_to = now()` or `releases.percent_rollout = 0`, `status = 'rolled_back'`. |
| 4 | Optionally set 100% traffic to previous release via release_routes. |
| 5 | Verify new runs use the good release; restart runners if needed. |
