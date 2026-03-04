# AI Factory — Terraform (Supabase + Vercel)

This directory provisions **Supabase** (staging + prod) and **Vercel** (Console) so you can automate the “Put AI Factory on the web” bootstrap.

## What you need before running Terraform

### 1. Vercel

- **Vercel API token** (Full Access)  
  Create at: [Vercel → Account → Tokens](https://vercel.com/account/tokens)  
  Set when running: `export VERCEL_API_TOKEN=your_token`
- **Team ID** (optional)  
  Only if you use a Vercel team. Leave unset for a personal account.

### 2. Supabase

- **Supabase access token**  
  Create at: [Supabase Dashboard → Account → Access Tokens](https://supabase.com/dashboard/account/tokens)  
  Set when running: `export SUPABASE_ACCESS_TOKEN=your_token`
- **Organization ID**  
  Your Supabase **org slug** (e.g. from the dashboard URL or Organization Settings).  
  Provide via variable (see below).
- **Database passwords**  
  One strong password for **staging** and one for **prod**. You’ll set them via variables; they are not stored in the repo.

### 3. Control Plane URLs (optional at first)

- After you deploy the Control Plane (e.g. Render), set:
  - `control_plane_url_staging` for preview deployments
  - `control_plane_url_prod` for production  
  You can leave these empty and use placeholders until Render is up.

---

## How to run

### One-time: provide variables

Use a mix of **environment variables** (for secrets) and **a `.tfvars` file** (do not commit `.tfvars` if it contains secrets).

**Option A — environment variables only**

```bash
cd infra
export VERCEL_API_TOKEN=your_vercel_token
export SUPABASE_ACCESS_TOKEN=your_supabase_token
terraform init
terraform plan \
  -var="supabase_organization_id=YOUR_ORG_SLUG" \
  -var="supabase_db_password_staging=STAGING_DB_PASSWORD" \
  -var="supabase_db_password_prod=PROD_DB_PASSWORD"
```

Or use Terraform’s automatic env vars for variables: `export TF_VAR_supabase_access_token=...`, `export TF_VAR_supabase_organization_id=...`, etc.

**Option B — `terraform.tfvars.example` (copy and fill, never commit the real one)**

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your org slug and (if you prefer) leave passwords for -var=
```

Then:

```bash
export VERCEL_API_TOKEN=...
export SUPABASE_ACCESS_TOKEN=...
terraform init
terraform plan -var="supabase_db_password_staging=..." -var="supabase_db_password_prod=..."
```

Apply when the plan looks correct:

```bash
terraform apply
```

### After first apply: set Supabase anon keys in Vercel

Terraform sets **NEXT_PUBLIC_SUPABASE_URL** from the created projects. The **NEXT_PUBLIC_SUPABASE_ANON_KEY** is set to a placeholder (`REPLACE_AFTER_FIRST_APPLY`). You must set the real anon key per environment:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → staging project → **Settings → API**.
2. Copy **anon public** key.
3. In Vercel: **Project → Settings → Environment Variables** — set `NEXT_PUBLIC_SUPABASE_ANON_KEY` for **Preview** (and **Development** if you use it) to that staging anon key.
4. Repeat for the **prod** Supabase project and set `NEXT_PUBLIC_SUPABASE_ANON_KEY` for **Production** in Vercel.

Alternatively, you can later add a Supabase data source or external script to read anon keys and feed them into Terraform (e.g. `vercel_project_environment_variable`) so they’re managed as code.

---

## Summary of what Terraform creates

| Resource | Purpose |
|----------|--------|
| **Supabase** | Two projects: `ai-factory-staging`, `ai-factory-prod` (us-east-1). |
| **Vercel** | One project `ai-factory-console` linked to `proventheory/AI-Factory`, root `console`, production branch `prod`. |
| **Vercel env vars** | `NEXT_PUBLIC_SUPABASE_URL` (staging/prod by target), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (placeholder → you set real keys in UI), `NEXT_PUBLIC_CONTROL_PLANE_API` (from variables or placeholder). |

After this, deploy the Control Plane (e.g. Render from `render.yaml`), then set the Control Plane URLs in variables and re-apply, or update them in the Vercel dashboard. **Render setup (Blueprint + env vars via MCP):** see [docs/RENDER_SETUP.md](../docs/RENDER_SETUP.md).

### Supabase Vault (optional)

To store GitHub, OpenAI, Vercel, and Supabase tokens in the DB for runners/MCP: run migrations (which add `secret_refs`), then in each Supabase project run **Dashboard → SQL Editor** with the contents of `scripts/seed-supabase-vault.sql` after replacing the placeholders with your values (same as in root `.env`). Or add each secret manually under **Project Settings → Vault**.
