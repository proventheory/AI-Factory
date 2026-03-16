# Recommended MCP Servers for AI Factory

The audit recommended adding MCP (Model Context Protocol) servers for GitHub, Vercel, and Supabase to complement the existing **Neon**, **Render**, and **cursor-ide-browser** integrations. This doc lists suggested servers and how to enable them in Cursor.

## Current MCPs (in use)

| Server        | Purpose                          |
|---------------|-----------------------------------|
| **user-Neon** | Neon DB: run_sql, branches, migrations |
| **user-render** | Render: services, deploys, env, logs |
| **cursor-ide-browser** | Browser automation, snapshots, profiling |

## Recommended additions

### 1. GitHub MCP

**Purpose:** Repository management, PR creation, code analysis, issue triage.

- **Official:** [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) — `github` server (requires `GITHUB_TOKEN`).
- **Cursor:** Add to Cursor Settings → MCP → Add server.

Example config (Cursor MCP JSON):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<your GITHUB_TOKEN from .env>"
      }
    }
  }
}
```

Use the same token as in `.env` (`GITHUB_TOKEN`); do not commit the token.

### 2. Vercel MCP

**Purpose:** Deployment management beyond webhooks (list projects, deployments, env vars, logs).

- **Community:** Search [MCP servers](https://github.com/modelcontextprotocol/servers) or npm for `vercel` MCP.
- **Env:** `VERCEL_API_TOKEN` or `VERCEL_TOKEN` (same as Control Plane self-heal).

Example (if a Vercel MCP package exists):

```json
{
  "mcpServers": {
    "vercel": {
      "command": "npx",
      "args": ["-y", "vercel-mcp-server"],
      "env": {
        "VERCEL_API_TOKEN": "<from .env>"
      }
    }
  }
}
```

Confirm the exact package name and env vars from the server’s repo.

### 3. Supabase MCP

**Purpose:** Database operations, real-time subscriptions, auth and storage helpers.

- **Community:** Search for Supabase MCP server (e.g. `supabase-mcp` or official Supabase MCP if available).
- **Env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or anon key for read-only).

Example:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "supabase-mcp-server"],
      "env": {
        "SUPABASE_URL": "https://<project>.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<service_role from Supabase dashboard>"
      }
    }
  }
}
```

Use the same Supabase project as Control Plane (staging/prod) if you want the agent to query the same DB.

## Enabling in Cursor

1. Open **Cursor Settings** → **MCP** (or `.cursor/mcp.json` in the project).
2. Add the desired `mcpServers` entries as above.
3. Restart Cursor or reload the window so the new servers are picked up.
4. Ensure env vars are set in the MCP config or in your environment (never commit secrets).

## Security

- Reuse tokens from `.env` only via Cursor’s env or MCP config; do not paste them into docs or code.
- Prefer least-privilege tokens (e.g. GitHub scopes: repo, read:org as needed).
- Supabase: use `service_role` only in a secure environment; for read-only tools consider the anon key with RLS.

## References

- [MCP specification](https://modelcontextprotocol.io/)
- [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol)
- AI Factory audit: `docs/AUDIT_REPORT_2026-03-16.md` (MCP section)
