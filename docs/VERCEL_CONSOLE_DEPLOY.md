# Deploy console to Vercel

- **Tailwind preset:** The console uses an inlined `console/tailwind.preset.js` (copied from `@ai-factory/ui`) so the Tailwind step does not require the workspace package at config load time.
- **Workspace dependency:** The app still depends on `@ai-factory/ui` (`packages/ui`) for React components. So the Vercel project must have access to the full repo:
  - In Vercel Dashboard → project → Settings → General → set **Root Directory** to `console`. Ensure the project is connected to the **full GitHub repo** (e.g. `proventheory/AI-Factory`), not a subfolder. Vercel clones the repo and runs the build from `console/`; `file:../packages/ui` will then resolve during `npm install`.
- Push to the production branch or trigger **Redeploy** from the Dashboard.

**Verify Self-heal page after deploy**

- **Main branch preview:** `https://ai-factory-console-git-main-proventheorys-projects.vercel.app/self-heal` (updates on each push to `main`).
- **Production:** If you use a custom production domain, open that URL + `/self-heal`. The page should show: (1) “Platform self-healing is automatic…” at the top; (2) “Platform self-heal (automatic)” with one-time setup and “After that, self-heal is autonomous.”; (3) “Local (repo on your machine)” with no numbered “2. Platform” list.
- Old deployment URLs (e.g. `...-g153okx1l-...`) are static and do not update; use the `-git-main-` preview or your production domain.
