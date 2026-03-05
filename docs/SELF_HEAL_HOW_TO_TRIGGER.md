# How to Trigger Auto-Debug and Self-Heal

The AI Factory has two self-heal paths. Use the one that matches how you work.

---

## 1. Local self-heal (repo on your machine)

**Use when:** You want the repo to auto-fix build/lint/type errors locally without the Control Plane.

**Steps:**

1. In the repo root, set `OPENAI_API_KEY` (required for the LLM).
2. Run:
   ```bash
   npm run self-heal
   ```
   This will:
   - Stash changes, create a branch like `autofix/<timestamp>`
   - Run `scripts/doctor.sh` to collect errors
   - Parse errors, load context, call the LLM for patches
   - Apply patches and re-run until fixed or budget exhausted

**Useful flags:**

| Command | Purpose |
|--------|---------|
| `npm run self-heal` | Full repair loop (default up to 5 iterations, $2 budget) |
| `npm run self-heal:dry` | No patches applied; show what would be done |
| `npm run self-heal:tsc` | Only run the TypeScript check step |
| `npm run self-heal:verbose` | More logging |
| `npm run self-heal:openhands` | Use OpenHands agent (if available) |
| `npm run self-heal:swe` | Use SWE-agent (if available) |

**Optional:** Create a baseline so known errors are skipped:
```bash
npm run baseline    # writes .self-heal-baseline.json
```

---

## 2. Platform self-heal (Control Plane + GitHub)

**Use when:** You want the platform to create an initiative and (when runners are connected) run a self-heal plan from a GitHub issue or PR.

**Trigger:** Add the **fix-me** label to an **issue** or **pull request** in the GitHub repo connected to the Control Plane.

**Requirements:**

1. **Control Plane (Render)**  
   For the service that receives the webhook, set:
   - `ENABLE_SELF_HEAL=true`  
   Otherwise the webhook responds with `self_heal: "disabled"`.

2. **GitHub webhook**  
   In the GitHub repo:
   - **Settings → Webhooks → Add webhook**
   - **Payload URL:** `https://<your-control-plane-url>/v1/webhooks/github`  
     (e.g. `https://ai-factory-api-prod.onrender.com/v1/webhooks/github`)
   - **Content type:** `application/json`
   - **Events:** “Let me select individual events” → check **Issues** and **Pull requests**
   - **Secret:** optional; if you set one, the Control Plane would need to verify it (not implemented by default)

3. **Database**  
   The Control Plane must have a working Postgres connection (initiatives and plans are stored there).

**What happens when you add the label:**

1. GitHub sends a `labeled` event to your webhook URL.
2. The Control Plane creates an initiative with title like `Self-heal: <issue title>` and `source_ref` = issue/PR URL.
3. It compiles a plan for that initiative (best-effort on webhook).
4. You see the new initiative and plan in the Console under **Initiatives** and **Plans**. When runners are deployed and polling, they can pick up the plan and run the self-heal (OpenHands or SWE-agent) and open a PR.

**To request a self-heal from the platform:**

1. Open your repo on GitHub.
2. Create an **issue** (or use an existing one) that describes what’s broken or what you want fixed.
3. Add the **fix-me** label to that issue (or to a PR).
4. The webhook fires; the Control Plane creates the initiative and plan.
5. In the Console, go to **Initiatives** (or **Pipeline Runs**) to see the new run and progress (once runners are connected).

---

## Summary

| Goal | Action |
|------|--------|
| **Auto-debug this repo right now (local)** | Run `npm run self-heal` in the repo (with `OPENAI_API_KEY` set). |
| **Ask the platform to self-heal from GitHub** | Add the **fix-me** label to an issue or PR; set `ENABLE_SELF_HEAL=true` on the Control Plane and configure the GitHub webhook to `POST /v1/webhooks/github`. |

For gating (evals, human approval) on self-healing PRs, see [LLM_GATEWAY_AND_OPTIMIZATION.md](LLM_GATEWAY_AND_OPTIMIZATION.md) (“Self-healing gating policy”).

---

## Debugging Render build failures (Render MCP)

If the Control Plane build fails on Render and you want an AI to read the logs and fix the code:

1. **Select a workspace** in the Render MCP (Cursor/Claude). The Render MCP needs a workspace to be selected before it can list services or fetch logs. In your Render dashboard, note your account/workspace; then in Cursor, use the Render MCP and select that workspace when prompted.
2. **Fetch build logs:** Use the Render MCP tools `list_services` (to get the service ID for `ai-factory-api-staging` or `ai-factory-api-prod`), then `list_logs` with `resource: [serviceId]` and `type: ["build"]` to get the build log lines.
3. **Fix and push:** Apply the same fixes you would for local tsc (path aliases, implicit `any`, missing modules), then commit and push so Render redeploys.
