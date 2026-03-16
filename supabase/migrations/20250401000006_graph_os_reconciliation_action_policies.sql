-- Graph OS Phase 5/6: reconciliation_tasks, reconciliation_events, action_policies, approval_policies.

BEGIN;

-- reconciliation_tasks: tracks reconcile attempts (idempotency_key unique)
CREATE TABLE IF NOT EXISTS reconciliation_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_node_id     uuid REFERENCES platform_graph_nodes(id) ON DELETE SET NULL,
  desired_state     text,
  observed_state    text,
  status            text NOT NULL DEFAULT 'pending',
  strategy_key       text,
  attempt_count     int NOT NULL DEFAULT 0,
  idempotency_key   text UNIQUE NOT NULL,
  last_error        text,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_tasks_node ON reconciliation_tasks(graph_node_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_tasks_status ON reconciliation_tasks(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_tasks_idempotency ON reconciliation_tasks(idempotency_key);

-- reconciliation_events: audit trail for repair
CREATE TABLE IF NOT EXISTS reconciliation_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_task_id uuid NOT NULL REFERENCES reconciliation_tasks(id) ON DELETE CASCADE,
  event_type            text NOT NULL,
  message               text,
  metadata_json         jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_events_task ON reconciliation_events(reconciliation_task_id);

-- action_policies: explicit action gating (auto-execute vs approval-required)
CREATE TABLE IF NOT EXISTS action_policies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key         text UNIQUE NOT NULL,
  action_type        text NOT NULL,
  scope_type         text,
  scope_ref          text,
  environment        text,
  requires_approval  boolean NOT NULL DEFAULT false,
  is_enabled         boolean NOT NULL DEFAULT true,
  rule_json          jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_action_policies_key ON action_policies(policy_key);
CREATE INDEX IF NOT EXISTS idx_action_policies_action ON action_policies(action_type);
CREATE INDEX IF NOT EXISTS idx_action_policies_enabled ON action_policies(is_enabled) WHERE is_enabled = true;

-- approval_policies: when automation stops and human must approve
CREATE TABLE IF NOT EXISTS approval_policies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key   text UNIQUE NOT NULL,
  scope_type   text CHECK (scope_type IN ('node_kind', 'operator', 'environment', 'artifact_type')),
  scope_ref    text,
  rule_json    jsonb,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_policies_key ON approval_policies(policy_key);
CREATE INDEX IF NOT EXISTS idx_approval_policies_active ON approval_policies(is_active) WHERE is_active = true;

COMMIT;
