# Webhooks

This doc describes webhook endpoints and the webhook outbox used by the Control Plane and Console, and how new pipelines get webhooks (self-heal).

---

## Incoming webhooks (Control Plane receives)

| Endpoint | Purpose | Used by |
|----------|---------|--------|
| **POST /v1/webhooks/github** | Create initiative from repo events; self-heal on `fix-me` label. | GitHub (repo webhook). |
| **POST /v1/webhooks/vercel** | Deploy / build events for self-heal and deploy_events. | Vercel (project webhook). |

- **GitHub:** Configure a repo webhook to point at `{CONTROL_PLANE_URL}/v1/webhooks/github`. Payloads create initiatives and trigger plan compilation when applicable; `fix-me` label drives self-healing flows.
- **Vercel:** Register a project for self-heal via **POST /v1/vercel/register** (body: `{ projectId, teamId? }`). That creates a Vercel webhook so deployment events are sent to **POST /v1/webhooks/vercel**. The Console **Self-heal** page describes how to trigger and use this.

---

## Are all webhooks established for the Console?

The **Console does not receive webhooks**. The **Control Plane** receives them. So “webhooks for Console” means: the Control Plane has the endpoints that the Console’s behavior depends on (e.g. fix-me → initiative, deploy events in the list). Those are:

- **GitHub** — **POST /v1/webhooks/github** (one per repo; you add it once in GitHub).
- **Vercel** — **POST /v1/webhooks/vercel** (one per Vercel project; created when you register the project).

Both are implemented and documented above.

---

## When new pipelines are added: self-heal and re-adding webhooks

When you add **new pipelines or projects**, webhooks should be re-established automatically where possible:

- **Vercel:** New Vercel projects get a webhook automatically when:
  - You call **POST /v1/vercel/register** with the project’s `projectId` (and optional `teamId`), or
  - A **build spec** is created/updated with `vercel_project_id` / `projectId` (Control Plane auto-calls register), or
  - A **launch action** is triggered with `projectId` in the body (Control Plane auto-calls register).
  So adding a new pipeline that uses a new Vercel project: either call **POST /v1/vercel/register** once for that project, or include the project in the build spec / launch so the API registers it. No manual Vercel Dashboard webhook step.

- **GitHub:** One webhook per repo. If you add a **new repo** that should trigger self-heal (fix-me), add a new webhook in that repo pointing at `{CONTROL_PLANE_URL}/v1/webhooks/github`. There is no API to create GitHub repo webhooks from the Control Plane (GitHub’s permission model). So “re-add” for new pipelines that use a new repo = add one webhook in that repo (one-time per repo).

- **Future providers (e.g. Render):** If you add a pipeline that uses another provider with webhooks, follow the same pattern: a **register** endpoint that creates the webhook on the provider and stores the project in a table (like **POST /v1/vercel/register** and `vercel_self_heal_projects`), and a **POST /v1/webhooks/{provider}** handler that receives events and writes to `deploy_events` or equivalent. Then call the register when new projects/pipelines are added (e.g. from build spec or launch).

---

## Webhook outbox (outgoing delivery tracking)

The **webhook_outbox** table stores rows for **outgoing** webhook deliveries (status, retries, idempotency). The Control Plane does not currently insert into it; when we add outbound webhook delivery (e.g. notifying an external system), those events will appear here.

- **Schema:** `supabase/migrations/20250303100000_webhook_outbox.sql`. Applied by `scripts/run-migrate.mjs` (same DB as the Control Plane).
- **API:**
  - **GET /v1/webhook_outbox** — list rows (query: `status`, `limit`, `offset`).
  - **PATCH /v1/webhook_outbox/:id** — update status after a send attempt (e.g. `sent`, `failed`, `last_error`, `attempt_count`, `next_retry_at`).
- **Console:** **Webhook Outbox** (or **Webhook delivery events**) page shows outbox rows. If you see **"relation webhook_outbox does not exist"**, run migrations against the same DB the API uses (see **docs/runbooks/console-db-relation-does-not-exist.md**).

Until outbound delivery is implemented, the outbox list will often be empty; the page message explains that events appear when the outbox is used.

---

## Summary

| Type | What | Where |
|------|------|--------|
| Incoming | GitHub repo events | POST /v1/webhooks/github |
| Incoming | Vercel deploy events | POST /v1/webhooks/vercel (register via POST /v1/vercel/register) |
| Outgoing | Delivery queue (future) | Table `webhook_outbox`; API GET/PATCH; Console Webhook Outbox page |
