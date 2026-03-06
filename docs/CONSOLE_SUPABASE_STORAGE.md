# Console + Supabase Storage (brand asset uploads)

The Console brand edit page can upload asset files (images) to Supabase Storage in addition to pasting URLs. This requires Supabase to be configured and the upload bucket + policies to exist.

## 1. Environment (Console)

Set in `console/.env.local` (or your deployment env):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

You can copy the project URL and anon key from the Supabase Dashboard: **Project Settings → API**.

## 2. Run the storage migration

Apply the migration that creates the `upload` bucket and RLS policies:

```bash
# From repo root, using Supabase CLI (recommended)
supabase db push

# Or run the migration SQL manually in Supabase Dashboard → SQL Editor:
# File: supabase/migrations/20250306140000_upload_bucket_and_policies.sql
```

That migration:

- Ensures bucket `upload` exists and is **public** (so `getPublicUrl()` works).
- Adds policies so **anon** and **authenticated** can:
  - **INSERT** into `upload` only under path prefix `brands/` (Console uploads to `brands/{brandId}/assets/...`).
  - **SELECT** from `upload` (so image URLs load in the UI).

## 3. Optional: create bucket in Dashboard

If you prefer not to run the migration, you can:

1. In Supabase Dashboard → **Storage**, create a bucket named **upload**.
2. Set it to **Public**.
3. In **Policies** for `storage.objects`, add:
   - **INSERT** for role `anon` (and optionally `authenticated`) with condition: `bucket_id = 'upload'` and `(storage.foldername(name))[1] = 'brands'`.
   - **SELECT** for roles `anon` and `authenticated` with condition: `bucket_id = 'upload'`.

## 4. Root .env (optional)

If the Control Plane or runners need to resolve Supabase Storage URIs (e.g. `supabase-storage://upload/...`), set in the root `.env`:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # or SUPABASE_ANON_KEY for read-only
```

The Console only needs the **public** anon key; never put the service role key in frontend env.
