# LLM Gateway (LiteLLM Proxy)

This folder contains config and Dockerfile for the AI Factory LLM gateway. All executor LLM calls should go to this service; provider API keys live only here.

## Deploy

- **Render:** New Web Service; use this Dockerfile or image `ghcr.io/berriai/litellm:main-latest` with config mounted; set env vars `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (optional), and optionally `LANGFUSE_SECRET_KEY` / `LANGFUSE_PUBLIC_KEY`.
- **Local:** `docker build -t ai-factory-gateway . && docker run -p 4000:4000 -e OPENAI_API_KEY=sk-... ai-factory-gateway`

### Render: set API keys on the gateway service

1. Open [Render Dashboard](https://dashboard.render.com).
2. Select the **gateway** service (e.g. `llm-gateway`), **not** the runner or API.
3. Go to **Environment** (left sidebar).
4. Add or edit:
   - **`OPENAI_API_KEY`** — your OpenAI API key (required; used for auto/chat, fast/chat, max/chat fallback).
   - **`ANTHROPIC_API_KEY`** — your Anthropic API key (optional; used for Claude in max/chat tier).
5. Click **Save changes**. Render will redeploy the service.
6. After deploy, check **Logs** and/or `https://llm-gateway.onrender.com/health` to confirm the gateway is up.

## Routing tiers

- `auto/chat` — Cheap model first (e.g. gpt-4o-mini); falls back to gpt-4o on failure.
- `fast/chat` — Same cheap model; caching enabled for safe job types.
- `max/chat` — Best model (e.g. gpt-4o, claude-3.5-sonnet) for complex tasks.

Runners set `LLM_GATEWAY_URL` to the gateway base URL (e.g. `http://localhost:4000` or `https://llm-gateway.onrender.com`) and use the llm-client to call with the desired model tier.

## Caching (Phase 3)

Response caching is enabled for `fast/chat` by default. Requires `REDIS_URL` in env.

**How it works:** Runners send `x-cache-scope: safe` for deterministic job types (triage, analyze_repo, code_review, etc.) and `cache-control: no-cache` for unsafe types (codegen, write_patch, etc.). The gateway caches responses for safe requests with a 1-hour TTL.

**Safe job types** (cached): triage, analyze_repo, code_review, plan_compile, plan_migration, research.

**Unsafe job types** (not cached): codegen, write_patch, submit_pr, apply_batch, openhands_resolver, prd, design, unit_test.

## Env vars

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (for claude models in MAX tier) |
| `REDIS_URL` | No | Redis URL for response caching (Phase 3) |
| `LANGFUSE_SECRET_KEY` | No | Langfuse secret for trace callbacks |
| `LANGFUSE_PUBLIC_KEY` | No | Langfuse public key |

## Docs

See [docs/LLM_GATEWAY_AND_OPTIMIZATION.md](../docs/LLM_GATEWAY_AND_OPTIMIZATION.md).
