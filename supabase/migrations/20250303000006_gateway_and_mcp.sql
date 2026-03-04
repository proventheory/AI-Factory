-- Phase 5/9: routing_policies, llm_budgets; Phase 5 MCP: mcp_server_config
-- See docs/LLM_GATEWAY_AND_OPTIMIZATION.md and docs/DEPLOYMENT_PLAN_WITH_MCP.md

BEGIN;

-- ============================================================
-- routing_policies: per job_type routing overrides for optimizer
-- ============================================================

CREATE TABLE IF NOT EXISTS routing_policies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      text        NOT NULL,
  model_tier    text        NOT NULL DEFAULT 'auto/chat',
  config_json   jsonb,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_type)
);

CREATE INDEX idx_routing_policies_active ON routing_policies (active, job_type);

-- ============================================================
-- llm_budgets: token/cost budgets per job_type or initiative
-- ============================================================

CREATE TABLE IF NOT EXISTS llm_budgets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type      text        NOT NULL CHECK (scope_type IN ('job_type', 'initiative')),
  scope_value     text        NOT NULL,
  budget_tokens   bigint,
  budget_dollars  numeric(12, 4),
  period          text        NOT NULL DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly')),
  current_usage   bigint      NOT NULL DEFAULT 0,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_value)
);

CREATE INDEX idx_llm_budgets_scope ON llm_budgets (scope_type, scope_value);

-- ============================================================
-- mcp_server_config: MCP server registry (Phase 4 MCP)
-- ============================================================

CREATE TABLE IF NOT EXISTS mcp_server_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL UNIQUE,
  server_type   text        NOT NULL CHECK (server_type IN ('http', 'stdio')),
  url_or_cmd    text        NOT NULL,
  args_json     jsonb,
  env_json      jsonb,
  auth_header   text,
  capabilities  text[],
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_server_config_active ON mcp_server_config (active);

-- RLS
ALTER TABLE routing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_server_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routing_policies_select" ON routing_policies FOR SELECT USING (true);
CREATE POLICY "llm_budgets_select" ON llm_budgets FOR SELECT USING (true);
CREATE POLICY "mcp_server_config_select" ON mcp_server_config FOR SELECT USING (true);

COMMIT;
