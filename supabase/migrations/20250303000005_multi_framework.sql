-- Multi-framework plan: agent_role, shared memory, approvals, initiatives, agent_memory
-- See docs/TODO_MULTI_FRAMEWORK_PLAN.md and .cursor/plans/metagpt_features_in_ai_factory_fbc6a722.plan.md

BEGIN;

-- plan_nodes: agent role (MetaGPT)
ALTER TABLE plan_nodes ADD COLUMN IF NOT EXISTS agent_role text;
COMMENT ON COLUMN plan_nodes.agent_role IS 'Agent role: product_manager, architect, engineer, qa, reviewer';
ALTER TABLE plan_nodes ADD COLUMN IF NOT EXISTS config jsonb;
ALTER TABLE plan_nodes ADD COLUMN IF NOT EXISTS timeout_seconds int;
ALTER TABLE plan_nodes ADD COLUMN IF NOT EXISTS consumes_artifact_types text[];

-- initiatives: goal_state, source_ref, template (Reflect, ticket-driven)
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS goal_state text;
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS goal_metadata jsonb;
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS source_ref text;
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS template_id text;
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS priority int DEFAULT 0;
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS metadata jsonb;
CREATE INDEX IF NOT EXISTS idx_initiatives_goal_state ON initiatives (goal_state) WHERE goal_state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_initiatives_source_ref ON initiatives (source_ref) WHERE source_ref IS NOT NULL;

-- plans: name, version
ALTER TABLE plans ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS version int DEFAULT 1;

-- runs: workspace_path, human_feedback, metadata, initiative_id (denorm), trigger_source, cancelled
ALTER TABLE runs ADD COLUMN IF NOT EXISTS workspace_path text;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS human_feedback text;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS initiative_id uuid REFERENCES initiatives(id);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS trigger_source text;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS cancelled_reason text;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES runs(id);
CREATE INDEX IF NOT EXISTS idx_runs_initiative ON runs (initiative_id) WHERE initiative_id IS NOT NULL;

-- artifacts: producer lineage
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS producer_plan_node_id uuid REFERENCES plan_nodes(id);
CREATE INDEX IF NOT EXISTS idx_artifacts_producer ON artifacts (producer_plan_node_id) WHERE producer_plan_node_id IS NOT NULL;

-- approvals: plan_node_id and request tracking (pending = row in approval_requests, no row in approvals yet)
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS plan_node_id uuid REFERENCES plan_nodes(id);
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS requested_at timestamptz;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS requested_reason text;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS rejected_reason text;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS comment text;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS timeout_at timestamptz;

-- approval_requests: runs waiting for human approval (created when scheduler hits approval node)
CREATE TABLE IF NOT EXISTS approval_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES runs(id),
  plan_node_id  uuid NOT NULL REFERENCES plan_nodes(id),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  requested_reason text,
  context_ref  text,
  UNIQUE (run_id, plan_node_id)
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_pending ON approval_requests (requested_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_run ON approval_requests (run_id);

-- agent_memory (Agent Zero / AutoGPT style)
CREATE TABLE IF NOT EXISTS agent_memory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid REFERENCES runs(id),
  initiative_id uuid REFERENCES initiatives(id),
  scope         text NOT NULL,
  key           text NOT NULL,
  value         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_initiative_scope ON agent_memory (initiative_id, scope) WHERE initiative_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_memory_run ON agent_memory (run_id) WHERE run_id IS NOT NULL;

-- run_messages (optional dialogue)
CREATE TABLE IF NOT EXISTS run_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid NOT NULL REFERENCES runs(id),
  plan_node_id        uuid REFERENCES plan_nodes(id),
  job_run_id          uuid REFERENCES job_runs(id),
  sender_role         text NOT NULL,
  receiver_role       text,
  message_type        text DEFAULT 'message',
  content_artifact_id uuid REFERENCES artifacts(id),
  sequence            int NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_run_messages_run ON run_messages (run_id);

-- plan_nodes display order
ALTER TABLE plan_nodes ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE plan_nodes ADD COLUMN IF NOT EXISTS sequence int;

COMMIT;
