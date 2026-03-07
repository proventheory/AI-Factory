# Deploy env setup — one-time checklist

This doc ties together **Supabase**, **Render**, and **Vercel** using the APIs and MCP where possible. Some values (e.g. database password) are only in the Supabase Dashboard, so those steps are manual.

---

## Exact steps: Fix DB connectivity + Console API

Do these in order so the Control Plane on Render can reach the DB and the Console can call the API.

### A. Set DATABASE_URL on Render (staging)

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** and select the project that backs staging (e.g. **AI Factory** or **ai-factory-staging**).
2. Go to **Settings** (left sidebar) → **Database**.
3. In **Connection string**, select **URI**.
4. Choose **Connection pooling**. For Render (IPv4-only), use **Session pooler** (Supabase: “Session pooler connections are IPv4 proxied for free” — avoids ENETUNREACH). Copy the URI. It looks like:
   ```text
   postgresql://postgres.PROJECT_REF:[YOUR-PASSWORD]@aws-0-REGION.pooler.supabase.com:6542/postgres
   ```
   (Session = port **6542**; transaction = **6543**. Either pooler works; session is explicitly IPv4-proxied.)
5. Replace `[YOUR-PASSWORD]` with your **database password** (from project creation or **Settings → Database → Reset database password** if you don’t have it).
6. Open **[Render Dashboard](https://dashboard.render.com)** → **ai-factory-api-staging** → **Environment**.
7. Click **Add Environment Variable**. Name: **DATABASE_URL**. Value: the full URI from step 5 (no quotes). Save.
8. Render will redeploy automatically. Wait until the deploy is **Live**.

### B. Set DATABASE_URL on Render (prod)

1. In Render Dashboard go to **ai-factory-api-prod** → **Environment**.
2. Add **DATABASE_URL** with the same connection string as staging (or your prod Supabase URI if you use a separate project). Save.
3. Wait for the deploy to be **Live**.

### B2. Run database migrations (one-time; fixes "relation \"initiatives\" does not exist")

The Control Plane expects tables like `initiatives`, `plans`, `runs`, etc. Create them by running the repo schema once against your Supabase DB.

**Option 1 — From your machine (with `psql` installed):**

1. Set `DATABASE_URL` to the same Session pooler URI you used on Render (staging Supabase).
2. In the repo root run:  
   `npm run db:migrate`  
   This runs `schemas/001_core_schema.sql` and `schemas/002_state_machines_and_constraints.sql`.

**Option 2 — Supabase Dashboard:**

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. New query: paste the full contents of **`schemas/001_core_schema.sql`** from the repo → **Run**.
3. New query: paste the full contents of **`schemas/002_state_machines_and_constraints.sql`** → **Run**.

After this, the `initiatives` table (and the rest of the core schema) exists. Re-check the API (step C).

### C. Verify Control Plane can reach the DB

1. Open **https://ai-factory-api-staging.onrender.com/health** — should return `{"status":"ok","service":"control-plane"}`.
2. Open **https://ai-factory-api-staging.onrender.com/v1/initiatives?limit=1**.  
   - If you see `[]` or a list: DB is connected and migrated.  
   - If you see `{"error":"relation \"initiatives\" does not exist"}`: run **B2** (migrations) above.  
   - If you see `{"error":"connect ENETUNREACH..."}` or similar: use a **pooler** URI (see below), not direct.

**If you see `connect ENETUNREACH` to an IPv6 address:**  
Render runs on IPv4 and often cannot reach Supabase’s **direct** DB host (`db.PROJECT_REF.supabase.co`), which can resolve to IPv6. Use the **Connection pooler** instead:

- In Supabase: **Settings → Database** → **Connection string** → **URI** → choose **Connection pooling**.
- **Session pooler** (port **6542**) is best for Render: Supabase proxies it over IPv4 (“Session pooler connections are IPv4 proxied for free”). Transaction pooler (port 6543) also uses the pooler host and may work.
- Host must be **`aws-0-REGION.pooler.supabase.com`** (e.g. `aws-0-us-west-2.pooler.supabase.com`). User: **`postgres.PROJECT_REF`**.
- Example (session): `postgresql://postgres.anqhihkvovuhfzsyqtxu:YOUR_PASSWORD@aws-0-us-west-2.pooler.supabase.com:6542/postgres`  
  Do **not** use **Direct connection** (`db....supabase.co`) on Render — use **Session** (or Transaction) **pooler** only. Update **DATABASE_URL** on both Render services, then redeploy.

### D. Set Console API URL on Vercel

1. Open **[Vercel](https://vercel.com)** → project **ai-factory-console** → **Settings** → **Environment Variables**.
2. Add (or edit):
   - **Name:** `NEXT_PUBLIC_CONTROL_PLANE_API`
   - **Value (Preview):** `https://ai-factory-api-staging.onrender.com`
   - **Value (Production):** `https://ai-factory-api-prod.onrender.com`
3. Save, then go to **Deployments** → open the **…** on the latest deployment → **Redeploy** so the new env is used.

### E. Confirm Console loads data

1. Open your Console **Preview** URL (e.g. the `git-main` or main-branch preview).
2. Open the dashboard/initiatives view. It should load initiatives (or empty list) without “Failed to fetch”.  
   - If it still fails: ensure CORS on Render is `*` or includes that exact Console origin (Render → **ai-factory-api-staging** → **Environment** → **CORS_ORIGIN**).

**Save build minutes:** To test without deploying and to skip builds when only non-Console code changed, see [VERCEL_TEST_WITHOUT_DEPLOYING.md](VERCEL_TEST_WITHOUT_DEPLOYING.md).

---

## Done via API / MCP

- **Render**
  - **CORS_ORIGIN** set to `*` for **ai-factory-api-staging** and **ai-factory-api-prod** (so the Control Plane API accepts requests from any origin until you lock it down).
  - Service URLs:
    - Staging: **https://ai-factory-api-staging.onrender.com**
    - Prod: **https://ai-factory-api-prod.onrender.com**

- **Supabase**
  - One active project found: **AI Factory** (ref `hksbpwpdewtbymeutsah`, region `us-west-2`).  
  - The Management API does **not** return the database password, so **DATABASE_URL** must be taken from the Dashboard (see below).

---

## You need to do (one-time)

### 1. DATABASE_URL on Render (both services)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → project **AI Factory** → **Settings** → **Database**.
2. Under **Connection string**, choose **URI** and copy the **Connection pooling** string. For Render use **Session pooler** (port 6542, IPv4-proxied) to avoid ENETUNREACH; or transaction (6543). It looks like:
   ```text
   postgresql://postgres.hksbpwpdewtbymeutsah:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6542/postgres
   ```
   Replace `[YOUR-PASSWORD]` with your database password (the one you set when creating the project or in Terraform).
3. In [Render Dashboard](https://dashboard.render.com):
   - **ai-factory-api-staging** → **Environment** → add **DATABASE_URL** = that connection string.
   - **ai-factory-api-prod** → **Environment** → add **DATABASE_URL** = same connection string (same Supabase project for now).

After saving, Render will redeploy so the Control Plane can connect to the DB.

### 2. Vercel: NEXT_PUBLIC_CONTROL_PLANE_API (when the Console project exists)

The Vercel project **ai-factory-console** is created by Terraform when you run `terraform apply` in `infra/`. Until then it doesn’t exist in your team.

After the project exists:

1. Open [Vercel](https://vercel.com) → project **ai-factory-console** → **Settings** → **Environment Variables**.
2. Add **NEXT_PUBLIC_CONTROL_PLANE_API**:
   - **Preview** (and **Development** if you use it): `https://ai-factory-api-staging.onrender.com`
   - **Production**: `https://ai-factory-api-prod.onrender.com`

Redeploy the Console so the frontend uses these URLs.

### 3. (Optional) Tighten CORS later

Once the Console is on Vercel, you can set **CORS_ORIGIN** on Render to the exact Console URLs instead of `*` (e.g. preview URL for staging, production URL for prod). You can do that via Render MCP: *“Update environment variables for ai-factory-api-staging: CORS_ORIGIN = https://ai-factory-console-xxx.vercel.app”*.

---

## Summary

| What | Where | Status |
|------|--------|--------|
| CORS_ORIGIN | Render (staging + prod) | Set to `*` via MCP |
| DATABASE_URL | Render (staging + prod) | **You add** from Supabase Dashboard → Database → connection string |
| NEXT_PUBLIC_CONTROL_PLANE_API | Vercel (ai-factory-console) | **You add** after Terraform creates the project; use the two Render URLs above |

Supabase project ref for reference: **hksbpwpdewtbymeutsah** (region **us-west-2**).

---

## "Nothing is fetching" / Console shows "Failed to fetch"

If the Console on Vercel shows **Error: Failed to fetch** (or nothing loads):

1. **Set the API URL on Vercel**
   - Vercel → your Console project → **Settings** → **Environment Variables**.
   - Add **NEXT_PUBLIC_CONTROL_PLANE_API**:
     - **Preview**: `https://ai-factory-api-staging.onrender.com`
     - **Production**: `https://ai-factory-api-prod.onrender.com`
   - **Redeploy** the Console (Deployments → … → Redeploy) so the new env is baked in.

2. **Confirm the Control Plane is live on Render**
   - Open https://ai-factory-api-staging.onrender.com/health (or the prod URL). If it doesn’t load or returns 5xx, the API isn’t running (e.g. build failed or service suspended).

3. **CORS on Render**
   - On the Render service, set **CORS_ORIGIN** to either:
     - `*` (allow any origin), or
     - Your exact Console URL(s). Vercel uses different URLs per deployment (e.g. `...-git-main-...` for branch previews, or a unique hash). You can set **multiple origins comma-separated**, e.g.  
       `https://ai-factory-console-git-main-proventheorys-projects.vercel.app,https://ai-factory-console-proventheorys-projects.vercel.app`  
     Without a matching origin, the browser will block the Console’s requests.
