# Vercel self-heal (100% automatic)

Vercel is **fully automatic** for the Operator Console and for **any AI Factory–launched project** (new sites, custom domains). No manual Vercel dashboard steps for new projects when you use the register API.

---

## 1. Register a project (automatic webhook + redeploy scan)

**For new builds / new projects / new domains:** Call the Control Plane once per Vercel project:

```http
POST /v1/vercel/register
Content-Type: application/json

{ "projectId": "<vercel-project-id-or-slug>", "teamId": "<optional-team-id>" }
```

This:

1. **Creates the webhook on Vercel** via the Vercel API (if `VERCEL_TOKEN` is set on the Control Plane), so deployment events POST to `https://<control-plane>/v1/webhooks/vercel`. No need to open Vercel → Settings → Webhooks.
2. **Adds the project** to the redeploy-scan list (table `vercel_self_heal_projects`), so the 5‑minute scan will retry failed deploys for this project.

Use this when:

- You **launch a new project** or **connect a domain** with AI Factory and that project is on Vercel — have the runner or agent call `POST /v1/vercel/register` with the new project’s ID.
- You onboard the **Operator Console** — call register with the Console’s Vercel project ID once.

**Requirements:** Control Plane has `VERCEL_TOKEN` (and optionally `CONTROL_PLANE_URL` so the webhook URL is correct). Table `vercel_self_heal_projects` exists (migration `20250320200000_vercel_self_heal_projects.sql`).

---

## 2. Webhook: notify Control Plane on failure

The **webhook** is created automatically when you call **POST /v1/vercel/register** (see above). If you prefer to add it manually in Vercel:

- **Payload URL:** `https://<your-control-plane>/v1/webhooks/vercel`
- **Events:** **deployment.error**, **deployment.canceled**, **deployment.ready**

The Control Plane accepts Vercel’s **native webhook payload**, normalizes it to `deploy_events`, and when `ENABLE_SELF_HEAL=true` and the event is a failure creates a **self-heal initiative**.

---

## 3. Redeploy: auto-retry failed deployments (like Render)

**On the Control Plane** set:

- **VERCEL_TOKEN** — required for register (webhook creation) and for the redeploy scan
- **VERCEL_PROJECT_IDS** / **VERCEL_PROJECT_ID** (optional) — env-based project list; **plus** any projects in `vercel_self_heal_projects` (from register)

Every **5 minutes** the Control Plane:

- For each project (env + DB), fetches the latest deployment
- If state is **ERROR** or **CANCELED**, triggers a **redeploy** via the Vercel API
- After **2 redeploys** per commit for that project, creates a **self-heal initiative** and stops

---

## New project / new site (100% automatic)

When you use AI Factory to **launch a new project** or **connect a domain** and that project is on Vercel:

1. **Call** `POST /v1/vercel/register` with `{ "projectId": "<new-project-id>", "teamId": "<if-team>" }` (e.g. from your launch flow or agent).
2. **Done.** The webhook is created on Vercel and the project is added to the redeploy scan. No Vercel dashboard steps and no need to edit Render env.

---

## See also

- [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) — Autonomous ops env checklist  
- [ENABLEMENT_ENV_VARS.md](ENABLEMENT_ENV_VARS.md) — VERCEL_* variables  
- [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md) — §4 and §5 (Vercel webhook + redeploy)
