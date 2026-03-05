# Deploy env setup — one-time checklist

This doc ties together **Supabase**, **Render**, and **Vercel** using the APIs and MCP where possible. Some values (e.g. database password) are only in the Supabase Dashboard, so those steps are manual.

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
2. Under **Connection string**, choose **URI** and copy the **Connection pooling** string (transaction mode, port 6543). It looks like:
   ```text
   postgresql://postgres.hksbpwpdewtbymeutsah:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres
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
