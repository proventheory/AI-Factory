# Let the Console Preview URL Load Without Login

The redirect to **Vercel login** when you open  
`https://ai-factory-console-git-main-proventheorys-projects.vercel.app/`  
comes from **Vercel Deployment Protection**, not from the Operator Console (ProfessorX) app. The app has no auth middleware; only Vercel’s edge is requiring sign-in.

To allow that URL (and other preview URLs) to load without login, use one of these in the **Vercel Dashboard**.

---

## Option 1: Disable Vercel Authentication for Preview (simplest)

1. Open **Vercel Dashboard** → your **AI Factory Console** project.
2. Go to **Settings** → **Deployment Protection**.
3. Under **Vercel Authentication**, turn it **Off** for **Preview Deployments** (or adjust the scope as you prefer).
4. Save. New visits to the preview URL will load the app without being asked to log in to Vercel.

**Note:** Production is usually already public unless you enabled protection for “All Deployments”.

---

## Option 2: Deployment Protection Exceptions (keep protection, allow one URL)

If you want to keep Vercel Authentication on for other previews but allow this one:

1. **Settings** → **Deployment Protection** → **Deployment Protection Exceptions**.
2. Add an exception for the preview deployment URL or a pattern (e.g. `*ai-factory-console*` or the exact branch URL).
3. That URL will bypass protection and load without login.

---

## Option 3: Protection Bypass for Automation (secret header / query)

For bots or scripts without turning off protection for everyone:

1. **Settings** → **Deployment Protection** → **Protection Bypass for Automation**.
2. Create a bypass (e.g. a secret header like `x-vercel-protection-bypass: <secret>` or a query param).
3. Use that header or query when opening the URL (e.g. in Playwright or curl). Only requests that include the bypass can access the preview without logging in.

Details: [Methods to bypass Deployment Protection](https://vercel.com/docs/security/deployment-protection/methods-to-bypass-deployment-protection).

---

## After the URL loads

Once the preview is accessible:

- The **home page** has “Sign in” (→ `/login`) and “Dashboard” (→ `/dashboard`). The app does not enforce auth; you can go to `/dashboard` or `/initiatives` directly.
- To test the E2E smoke: run the script, then open `/initiatives` in the browser and confirm the new initiative appears.
