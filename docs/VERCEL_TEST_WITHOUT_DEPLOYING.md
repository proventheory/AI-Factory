# Test Without Deploying — Save Vercel Build Minutes

Build minutes on Vercel are billed (e.g. **Build & Deploy → Build Minutes**). Every push can trigger a build. This doc explains how to **test locally** so you only deploy when you’re ready, and how to **skip builds** when the Console didn’t change.

---

## 1. Test the Console locally (no Vercel build)

Use the staging API from your machine so you never need a deploy just to try a change.

1. **Start the Console:**
   ```bash
   cd console && npm run dev
   ```
2. Open **http://localhost:3000**.
3. Point the app at **staging**:
   - Set **`NEXT_PUBLIC_CONTROL_PLANE_API`** to `https://ai-factory-api-staging.onrender.com` (in `console/.env.local` or in Vercel env for local: create `console/.env.local` with that variable).
4. Use the app as normal (same data as staging). No deploy, no build minutes.

When you’re happy, commit and push; then Vercel will build once.

---

## 2. Only build when the Console (or its deps) change

If the repo has more than the Console (e.g. control-plane, runners, scripts), a push that only touches those shouldn’t need a Console build.

We have a script that **skips the build** when nothing under `console/` or `packages/` (e.g. `@ai-factory/ui`) changed:

- **Script:** `scripts/vercel-ignore-build-step.sh`
- **Behavior:** Exits `0` → Vercel skips the build. Exits `1` → Vercel runs the build.

**Configure in Vercel:**

1. Open **Vercel** → project **ai-factory-console** → **Settings** → **General**.
2. Under **Build & Development Settings**, find **Ignored Build Step**.
3. Set the command:
   - **Root Directory is empty (repo root):**  
     `bash scripts/vercel-ignore-build-step.sh`
   - **Root Directory is `console`:**  
     `bash ../scripts/vercel-ignore-build-step.sh`
4. Save.

Result: pushes that only change e.g. `control-plane/`, `runners/`, `docs/`, or `scripts/` (other than the ignore script) won’t trigger a build, so you spend fewer build minutes.

---

## 3. Optional: fewer preview builds

- In **Settings → Git**, you can **disable “Preview” deployments for branches** and only deploy production from `main`, so you get one build per merge instead of per commit. Use this if you’re happy testing locally and only need production (or a single preview) to update.

---

## Summary

| Goal                         | What to do |
|-----------------------------|------------|
| Try UI/Console changes      | `cd console && npm run dev` + `.env.local` with staging API; no deploy. |
| Avoid builds on non-Console changes | Set **Ignored Build Step** to `bash scripts/vercel-ignore-build-step.sh` (or `../scripts/...` if root is `console`). |
| Fewer preview builds        | Turn off preview deployments for non-main branches if you don’t need them. |
