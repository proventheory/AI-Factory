# Self-heal: provider deploy status reference

**Single source of truth** for which deploy status values we treat as "failed" and remediate (trigger redeploy). So self-heal and AI agents work correctly: we do **not** assume values; we verify from **official API docs** or **live API responses** and keep code in sync.

**Agents / automation:** When changing or debugging deploy-failure self-heal, or when a failed deploy is not remediating:
1. Run **`node --env-file=.env scripts/verify-provider-status-values.mjs`** from repo root. It calls Render and Vercel APIs and prints the actual `status` (Render) and `state` (Vercel) returned.
2. If the API returns a failure value not in the code lists below, add it in `control-plane/src/deploy-failure-self-heal.ts` (Render) or `control-plane/src/vercel-redeploy-self-heal.ts` (Vercel) and in this doc, then deploy the Control Plane so the loop remediates correctly.

---

## Render (control-plane/src/deploy-failure-self-heal.ts)

| Status         | Meaning                    | We remediate? |
|----------------|----------------------------|---------------|
| **build_failed** | Build failed (e.g. compile error). | ✅ Yes |
| **failed**       | Deploy failed (e.g. runtime/health). | ✅ Yes |
| **update_failed** | Deploy update failed (Render API; observed for failed staging deploys). | ✅ Yes |
| **canceled**     | Deploy was canceled.       | ✅ Yes |
| live, deactivated, build_in_progress, update_in_progress, queued, … | Success, superseded, or in-progress. (We observed `deactivated` from live API; we do not remediate.) | No |

**Where it's used:** `FAILED_STATUSES` in `control-plane/src/deploy-failure-self-heal.ts`.  
**How we know:** Render does not publish a full status enum in their public API reference. We verified from **live API response**: `GET /v1/services/{serviceId}/deploys` returns an array; each item has `deploy.status` (or top-level `status`). We observed `build_failed` for failed builds and `live` for success. If a failed deploy isn’t remediating, run `scripts/verify-provider-status-values.mjs` and inspect the printed `status`; add any missing failure value to `FAILED_STATUSES` and to this table.  
Render API: [List deploys](https://api-docs.render.com/reference/list-deploys).

---

## Vercel (control-plane/src/vercel-redeploy-self-heal.ts)

| State      | Meaning                    | We remediate? |
|------------|----------------------------|---------------|
| **ERROR**   | Deployment failed (e.g. build error). | ✅ Yes |
| **CANCELED** | Deployment was canceled.   | ✅ Yes |
| READY, BUILDING, QUEUED, INITIALIZING, … | Success or in-progress. | No |

**Where it's used:** `FAILED_STATES` in `control-plane/src/vercel-redeploy-self-heal.ts`.  
**How we know:** From **Vercel’s official REST API reference**. List deployments (`GET /v6/deployments`) response includes `deployments[].state` with enum: `BUILDING`, `ERROR`, `INITIALIZING`, `QUEUED`, `READY`, `CANCELED`, `DELETED`. We remediate `ERROR` and `CANCELED` only (not `DELETED`, which is intentional deletion). So our list is **verified against the published schema**.  
Vercel API: [List deployments](https://vercel.com/docs/rest-api/reference/endpoints/deployments/list-deployments) (see Query param `state` and Response `state` enum).

---

## Terraform and Supabase (no status mapping here)

- **Terraform** (infra/): Uses `VERCEL_API_TOKEN` and `SUPABASE_ACCESS_TOKEN` for **provisioning** (create project, set env vars). It does **not** read deploy status from Vercel or Supabase. The only overlap with self-heal is the **token**: we accept `VERCEL_API_TOKEN` or `VERCEL_TOKEN` in the Control Plane so one token works for both Terraform and self-heal. No status enum to map.
- **Supabase**: Deploy-failure self-heal does **not** call Supabase’s API. We use Supabase (Postgres) as the Control Plane DB; the self-heal logic only calls **Render** and **Vercel** APIs for deploy status. So there is no Supabase “status” to map for this feature.

---

## Adding a new provider or status

1. **Confirm the value** from the provider's API docs or a real failed deploy response.
2. **Add the status** to the appropriate array in the self-heal module (`FAILED_STATUSES` for Render, `FAILED_STATES` for Vercel).
3. **Update this doc** with the new row in the table and a short note.
4. **Deploy the Control Plane** so the change is live; the 5‑minute loop and `POST /v1/self_heal/deploy_failure_scan` will then remediate that status.

**Why this matters:** We previously only treated Render `failed` and `canceled`; Render actually returns **build_failed** for failed builds, so gateway (and others) were never remediated until we added `build_failed`. So self-heal and agents must **verify** each provider’s response (run `scripts/verify-provider-status-values.mjs` or check official docs), not assume. Keeping this reference and the code in sync is what makes self-heal work correctly without human intervention.
