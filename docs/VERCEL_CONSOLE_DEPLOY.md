# Deploy console to Vercel

- **Tailwind preset:** The console uses an inlined `console/tailwind.preset.js` (copied from `@ai-factory/ui`) so the Tailwind step does not require the workspace package at config load time.
- **Workspace dependency:** The app still depends on `@ai-factory/ui` (`packages/ui`) for React components. So the Vercel project must have access to the full repo:
  - In Vercel Dashboard → project → Settings → General → set **Root Directory** to `console`. Ensure the project is connected to the **full GitHub repo** (e.g. `proventheory/AI-Factory`), not a subfolder. Vercel clones the repo and runs the build from `console/`; `file:../packages/ui` will then resolve during `npm install`.
- Push to the production branch or trigger **Redeploy** from the Dashboard.

**Verify Self-heal page after deploy**

- **Main branch preview:** `https://ai-factory-console-git-main-proventheorys-projects.vercel.app/self-heal` (updates on each push to `main`).
- **Production:** If you use a custom production domain, open that URL + `/self-heal`. The page should show: (1) “Platform self-healing is automatic…” at the top; (2) “Platform self-heal (automatic)” with one-time setup and “After that, self-heal is autonomous.”; (3) “Local (repo on your machine)” with no numbered “2. Platform” list.
- Old deployment URLs (e.g. `...-g153okx1l-...`) are static and do not update; use the `-git-main-` preview or your production domain.

## Control Plane URL (required for Shopify `shpat_` and all API data)

- In Vercel → project → **Settings → Environment Variables**, set **`NEXT_PUBLIC_CONTROL_PLANE_API`** to your live Control Plane base URL (no trailing slash), e.g. `https://ai-factory-api-staging.onrender.com`.
- Redeploy the Console after changing it (Next.js inlines this at build time).
- Redeploy the **Control Plane** on Render from current `main` so `GET /health` returns `capabilities.shopify_brand_admin_token: true`. If that field is missing, the Brand edit page will warn that the API is too old for Admin API tokens.
- On the Control Plane service, set **`SHOPIFY_CONNECTOR_ENCRYPTION_KEY`** (and **`CORS_ORIGIN`** to your Vercel origin). Run DB migrations so `brand_shopify_credentials.encrypted_admin_access_token` exists.
