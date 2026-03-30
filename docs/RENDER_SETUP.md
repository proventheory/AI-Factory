# Render setup (Control Plane) — Dashboard + MCP

Control Plane runs on Render as two web services: **ai-factory-api-staging** (branch `main`) and **ai-factory-api-prod** (branch `prod`). You can do most of the setup via the [Render MCP server](https://render.com/docs/mcp-server) from Cursor.

---

## 1. Enable Render MCP in Cursor

### 1.1 Create a Render API key

1. Go to [Render → Account Settings → API Keys](https://dashboard.render.com/settings#api-keys).
2. Create an API key and copy it.

> Render API keys are broadly scoped (all workspaces/services). The MCP server can **update environment variables** for existing services; it does not delete resources.

### 1.2 Add the Render MCP server to Cursor

Edit **`~/.cursor/mcp.json`** (create it if it doesn’t exist). Add the `render` server:

```json
{
  "mcpServers": {
    "render": {
      "url": "https://mcp.render.com/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_RENDER_API_KEY>"
      }
    }
  }
}
```

Replace `<YOUR_RENDER_API_KEY>` with your key. Your key is stored in repo root **`.env`** as `RENDER_API_KEY` (and in Supabase Vault once you run `scripts/seed-supabase-vault.sql`); paste the same value into `mcp.json` so Cursor can talk to Render via MCP.

Restart Cursor (or reload the window) so it picks up the new MCP server. After that you can ask: *“List my Render services”* or *“Set my Render workspace to \<name\>”* and the AI can verify things and set env vars via MCP.

---

## 2. What you can do via MCP vs Dashboard

| Step | Via MCP? | How |
|------|----------|-----|
| Create Blueprint / two services | **No** | Do **once** in [Render Dashboard](https://dashboard.render.com): **New → Blueprint** → connect the AI Factory repo. Render reads `render.yaml` and creates `ai-factory-api-staging` and `ai-factory-api-prod`. |
| Set workspace | **Yes** | In Cursor, prompt: *“Set my Render workspace to \<your workspace name\>.”* |
| List services | **Yes** | e.g. *“List my Render services.”* |
| **Set env vars** (DATABASE_URL, CORS_ORIGIN) | **Yes** | After the two services exist, you can ask: *“Update environment variables for ai-factory-api-staging: DATABASE_URL = \<staging Supabase connection string\>, CORS_ORIGIN = \<Vercel preview URL\>.”* Same for `ai-factory-api-prod` with prod DATABASE_URL and prod Console URL. |
| View logs / metrics | **Yes** | e.g. *“Pull the most recent error-level logs for ai-factory-api-staging.”* |

So: **one-time in Dashboard** = New → Blueprint, connect repo. **Rest** (env vars, logs, metrics) can be done via MCP.

---

## 3. Order of operations

1. **Terraform** (already set up): create Supabase staging + prod and Vercel project.
2. **Render Dashboard**: **New → Blueprint** → connect AI Factory repo (so the two services exist).
3. **Get values:**
   - **Staging DATABASE_URL**: Supabase → project **ai-factory-staging** → **Settings → Database** → Connection string (URI, with password).
   - **Prod DATABASE_URL**: Same for **ai-factory-prod**.
   - **CORS_ORIGIN** (optional): Vercel Preview URL (staging), Vercel Production URL (prod).
4. **Via MCP in Cursor**: Set your Render workspace, then ask to update env vars for **ai-factory-api-staging** and **ai-factory-api-prod** with the DATABASE_URL (and optionally CORS_ORIGIN) values above.
5. **Vercel** (or Terraform): set **NEXT_PUBLIC_CONTROL_PLANE_API** for Preview to the staging Render URL (e.g. `https://ai-factory-api-staging.onrender.com`) and for Production to the prod Render URL (e.g. `https://ai-factory-api-prod.onrender.com`).

---

## 4. Short checklist

- [ ] Create Render API key; add Render MCP to `~/.cursor/mcp.json` and restart Cursor.
- [ ] In Render Dashboard: **New → Blueprint** → connect AI Factory repo.
- [ ] After Terraform apply: get **staging** and **prod** Supabase **Settings → Database** connection strings.
- [ ] In Cursor (via MCP): set Render workspace, then update env vars for **ai-factory-api-staging** (DATABASE_URL, optional CORS_ORIGIN) and **ai-factory-api-prod** (same).
- [ ] For **no-artifacts self-heal** (automatic worker env sync + new run when runs have no artifacts): on the **Control Plane** service set `ENABLE_SELF_HEAL=true` and `RENDER_API_KEY` (same key as in MCP). Optionally set `CONTROL_PLANE_URL` and `LLM_GATEWAY_URL` so they are pushed to the worker; if unset, CONTROL_PLANE_URL is derived from the API service URL.
- [ ] In Vercel (or Terraform): set **NEXT_PUBLIC_CONTROL_PLANE_API** for Preview and Production to the two Render service URLs.

---

## 5. Build failures (troubleshooting)

If a deploy fails on Render, use MCP: *“List recent deploys for ai-factory-api-staging”* then *“Get deploy &lt;id&gt;”* or *“List logs for ai-factory-api-staging in the last hour”* to see the error.

- **`Could not resolve "/app/control-plane/src/index.ts"`** — The Dockerfile must use **relative** paths for esbuild (e.g. `control-plane/src/index.ts`, `dist/control-plane-bundle.cjs`). Absolute paths like `/app/...` fail in Render’s build context. Keep `COPY . .` so the full repo is in the image; do not switch to `COPY control-plane runners adapters ./` with absolute esbuild paths.
- **`open Dockerfile.control-plane: no such file or directory`** — The branch you’re deploying (e.g. `prod`) doesn’t have `Dockerfile.control-plane` at the repo root. Merge `main` into that branch so the file exists, then redeploy. If `prod` has required status checks, open a **PR from `main` into `prod`** and merge after CI passes; direct push to `prod` will be rejected.

---

## 6. DB migrations (Console/API required tables)

`npm run db:migrate` runs core schemas (001, 002) plus: webhook_outbox, **console_required_tables** (agent_memory, mcp_server_config, llm_budgets, routing_policies, brand_themes, brand_profiles, document_templates, document_components), and brand_design_tokens_flat.

For a DB that already has the core schema, use:

```bash
DATABASE_URL='postgresql://...' npm run db:migrate:new
```

This runs console_required_tables, webhook_outbox, and brand_design_tokens_flat. Run once per environment (staging/prod) so the Control Plane and Console pages (Agent Memory, Webhook Outbox, MCP Servers, LLM Budgets, Routing Policies, Document Templates) work.

**If Render uses a different DB than your local `.env`:** get the staging (or prod) connection string from Supabase → Project → Settings → Database (Session pooler URI with password), then run locally: `DATABASE_URL='postgresql://...' npm run db:migrate:new`. Use the same URI as the one set in Render → service → Environment for DATABASE_URL.

---

## 7. References

- [Render MCP Server](https://render.com/docs/mcp-server) — setup and supported actions.
- [Render API](https://render.com/docs/api) — create API key.
- Repo: `render.yaml` (Blueprint spec), `Dockerfile.control-plane` (root-context build), `control-plane/` (app). Render uses repo root as Docker context so the Control Plane can import `runners` code (e.g. artifact signed URLs).
