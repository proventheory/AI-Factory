# Staging Render checklist (non‑prod)

Use this after checking Environment for **ai-factory-api-staging**, **ai-factory-gateway-staging**, and **ai-factory-runner-staging**.

---

## ai-factory-api-staging (Control Plane)

| Variable | Required | You have | Notes |
|----------|----------|----------|--------|
| DATABASE_URL | Yes | ✓ | Same DB as runner. |
| CORS_ORIGIN | Yes | ✓ (*) | Set to console origin in prod; * is OK for staging. |
| PORT | Yes | ✓ (10000) | — |
| NODE_ENV | No | ✓ (production) | Fine. |

**Optional (for self‑heal to sync worker env):**

- **ENABLE_SELF_HEAL** = `true`
- **RENDER_API_KEY** = (Render API key)
- **LLM_GATEWAY_URL** = `https://ai-factory-gateway-staging.onrender.com` (or your gateway URL)

If these are set, the control plane can push DATABASE_URL, CONTROL_PLANE_URL, and LLM_GATEWAY_URL to the runner and restart it when runs have no artifacts.

**Verdict:** Nothing critical missing for basic runs. Add the optional three only if you want self‑heal.

---

## ai-factory-gateway-staging (LLM Gateway)

| Variable | Required | You have | Notes |
|----------|----------|----------|--------|
| OPENAI_API_KEY | Yes | ✓ | — |
| CONTROL_PLANE_URL | For routing | ✓ | https://ai-factory-api-staging.onrender.com |
| NODE_ENV | No | ✓ (production) | Fine. |

**LLM_GATEWAY_URL** on this service points to `https://llm-gateway.onrender.com`. If this *is* your LiteLLM gateway, the **runner** should call this service; if your actual gateway is **ai-factory-gateway-staging**, the runner’s `LLM_GATEWAY_URL` should be `https://ai-factory-gateway-staging.onrender.com`.

**Verdict:** OK as long as the runner’s LLM_GATEWAY_URL matches the gateway that’s actually serving LLM requests.

---

## ai-factory-runner-staging (Worker)

| Variable | Required | You have | Notes |
|----------|----------|----------|--------|
| DATABASE_URL | Yes | ✓ | Must match Control Plane. |
| CONTROL_PLANE_URL | Yes | ✓ | **Check for typo:** must be `https://**ai**-factory-api-staging.onrender.com` (not `a1-factory`). |
| LLM_GATEWAY_URL or OPENAI_API_KEY | Yes | ✓ (both) | Runner can call gateway or OpenAI direct. |

**Critical:** If `CONTROL_PLANE_URL` is `https://a1-factory-api-staging.onrender.com`, change **a1** to **ai**. Wrong URL causes runner to fail loading brand/routing and can contribute to pipeline failures.

**LLM_GATEWAY_URL:** If you use **ai-factory-gateway-staging** as the LLM gateway, set:

- `LLM_GATEWAY_URL` = `https://ai-factory-gateway-staging.onrender.com`

If you use a separate **llm-gateway** service, keep `https://llm-gateway.onrender.com`.

**Verdict:** Confirm CONTROL_PLANE_URL is `ai-factory` (not `a1-factory`). Confirm LLM_GATEWAY_URL points to the gateway service that’s actually deployed and healthy.

---

## Next steps (in order)

1. **Fix CONTROL_PLANE_URL on the runner** (if it says `a1-factory`): Edit env → set `CONTROL_PLANE_URL` = `https://ai-factory-api-staging.onrender.com` → Save (worker will redeploy).
2. **Align LLM gateway URL on the runner:** If your only gateway is ai-factory-gateway-staging, set the runner’s `LLM_GATEWAY_URL` = `https://ai-factory-gateway-staging.onrender.com`; otherwise leave as is and ensure that gateway is up and `/health` returns 200.
3. **Optional – self‑heal on Control Plane:** On **ai-factory-api-staging**, add `ENABLE_SELF_HEAL=true`, `RENDER_API_KEY`, and optionally `LLM_GATEWAY_URL`; then the API can sync worker env when runs have no artifacts.
4. **Deploy code:** Ensure the latest commit (run ordering, started_at, wizard redirect, runbook, empty-state copy) is pushed to `main`; trigger deploy on Render for **ai-factory-api-staging** and **ai-factory-runner-staging** (and gateway if you changed its code). Vercel will auto-deploy the console from `main`.

After that, run the email wizard again and check Pipeline Runs (filter **All**, newest at top).
