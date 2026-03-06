# Deploy Phase 3 — One-time checklist

Complete these once so **Migrate and test** runs successfully on push to `main` and `prod`. See [DEPLOY_PLAN_PENDING.md](DEPLOY_PLAN_PENDING.md) for full context.

---

## 1. GitHub Actions secrets (Settings → Secrets and variables → Actions → Secrets)

Add these **secrets** (they are not in the repo):

| Secret name | Where to get it | Used by |
|-------------|-----------------|---------|
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens | migrate-and-test (both jobs) |
| `SUPABASE_PROJECT_REF_STAGING` | Staging project ref | `anqhihkvovuhfzsyqtxu` |
| `SUPABASE_PROJECT_REF_PROD` | Prod project ref | `wxupyzthtzeckgbzqmjy` |
| `SUPABASE_DB_PASSWORD_STAGING` | Staging DB password (for `supabase link`) | migrate-and-test staging |
| `SUPABASE_DB_PASSWORD_PROD` | Prod DB password | migrate-and-test prod |

---

## 2. GitHub Actions variables (Settings → Secrets and variables → Actions → Variables)

Add these **variables** (non-secret; smoke test URLs):

| Variable name | Example value | Notes |
|---------------|---------------|--------|
| `CONTROL_PLANE_URL_STAGING` | `https://ai-factory-api-staging.onrender.com` | Render staging API |
| `CONTROL_PLANE_URL_PROD` | `https://ai-factory-api-prod.onrender.com` | Render prod API |
| `CONSOLE_URL_STAGING` | Your Vercel **preview** URL (e.g. `https://ai-factory-console-xxx.vercel.app`) | Set after first Vercel deploy from `main` |
| `CONSOLE_URL_PROD` | Your Vercel **production** URL | Your prod domain |

---

## 3. Optional: branch protection (Settings → Branches)

- Add rule for branch **prod**
- Require status checks: **Migrate and test** (and **CI** if you use it) before merging

---

## 4. Verify

After adding secrets and variables:

1. Push to **main** → staging job runs: `supabase link` + `db push`, build console, poll Control Plane + Console.
2. Merge to **prod** and push → prod job runs the same for production.

If the workflow fails with "SUPABASE_ACCESS_TOKEN is not set" or similar, the step **Check deploy env** will report which secret or variable is missing.
