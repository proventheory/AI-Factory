# What’s pending: “Put AI Factory on the Web” plan

Compared to the branch-based, deploy-on-push plan. **Phase 3 (GitHub Actions)** workflow is implemented; you only need to add secrets/vars and optionally branch protection.

---

## Done (no action needed)

| Item | Status |
|------|--------|
| **Branch strategy** | main → staging, prod → production |
| **Vercel** | One project, root `console`, production branch = `prod`, env vars (anon keys, SUPABASE_URL, CONTROL_PLANE) set per environment |
| **Render Blueprint** | `render.yaml` with ai-factory-api-staging (main) + ai-factory-api-prod (prod), branch-based, DATABASE_URL + CORS set on both |
| **Deploy on push** | Vercel and Render deploy on push (no CI deploy step) |
| **Supabase** | Two projects: staging (`anqhihkvovuhfzsyqtxu`), prod (`wxupyzthtzeckgbzqmjy`); migrations and vaults done on both |
| **Terraform** | infra/ manages Vercel project + env vars and Supabase projects |
| **Phase 0 bootstrap** | Supabase, Vercel, Render created and wired |
| **Phase 1 Control Plane** | PORT, /health, CORS_ORIGIN |
| **Phase 2 Render** | Blueprint added and synced |
| **ci.yml** | Runs on PR to main/prod: lint, typecheck, build console (and control-plane via root `tsc`) |
| **migrate-and-test.yml** | Two jobs (staging on main, prod on prod): Supabase link + db push, build console, poll Control Plane + Console URLs, smoke fails the workflow |

---

## Phase 3 — Confirm these (then you’re done)

### 1. GitHub Actions secrets / variables

Add in **GitHub → Repo → Settings → Secrets and variables → Actions**:

| Name | Used by | Notes |
|------|--------|--------|
| `SUPABASE_ACCESS_TOKEN` | migrate-and-test | Supabase dashboard → Account → Access Tokens |
| `SUPABASE_PROJECT_REF_STAGING` | migrate-and-test | `anqhihkvovuhfzsyqtxu` |
| `SUPABASE_PROJECT_REF_PROD` | migrate-and-test | `wxupyzthtzeckgbzqmjy` |
| `SUPABASE_DB_PASSWORD_STAGING` | migrate-and-test | Staging DB password (for `supabase link` in CI) |
| `SUPABASE_DB_PASSWORD_PROD` | migrate-and-test | Prod DB password |

**Variables** (non-secret, for smoke URLs):

| Name | Value |
|------|--------|
| `CONTROL_PLANE_URL_STAGING` | `https://ai-factory-api-staging.onrender.com` |
| `CONTROL_PLANE_URL_PROD` | `https://ai-factory-api-prod.onrender.com` |
| `CONSOLE_URL_STAGING` | Your Vercel **preview** URL (e.g. `https://ai-factory-console-*.vercel.app` or a custom preview domain) |
| `CONSOLE_URL_PROD` | Your Vercel **production** URL |

After the first Vercel deploy from `main`, copy the deployment’s **Visit** URL into `CONSOLE_URL_STAGING`. Production domain goes in `CONSOLE_URL_PROD`.

---

### 2. Branch protection (optional)

On **GitHub → Repo → Settings → Branches**, add a rule for **prod**:

- Require status checks to pass before merging (e.g. “Migrate and test” / “CI”).  
- So: merge main → prod only when the migrate-and-test (and CI) run for the commit you’re merging has passed.

---

## Summary

| Item | Action |
|------|--------|
| **Secrets** | Add all 5 in Actions → Secrets. |
| **Variables** | Add all 4 URLs in Actions → Variables; set `CONSOLE_URL_STAGING` after first Vercel deploy from `main`. |
| **Branch protection** | Optionally require “Migrate and test” (and CI) on `prod`. |

Once secrets and variables are set, the flow is: **push main → staging deploys (Vercel + Render) and migrate-and-test runs for staging; merge to prod and push → prod deploys and migrate-and-test runs for prod** — with no CI deploy step and no dashboard needed for normal deploys.
