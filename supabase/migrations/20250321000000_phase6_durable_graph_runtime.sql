-- Phase 6: Durable Graph Runtime for AI Orchestration.
-- Tables: graph_runs, graph_nodes, graph_edges, node_executions, graph_run_events,
-- node_input_bindings, node_output_bindings, node_leases, repair_attempts, evaluation_results, graph_run_checkpoints.
-- See plan: Graphs, Artifact Hygiene, Capability Graph, and Self-Heal Loop (Phase 6 RFC).

BEGIN;

-- graph_runs: durable workflow execution
CREATE TABLE IF NOT EXISTS graph_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid REFERENCES initiatives(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  policy_json   jsonb,
  budget_json   jsonb,
  cursor_json   jsonb
);
CREATE INDEX IF NOT EXISTS idx_graph_runs_status ON graph_runs (status);
CREATE INDEX IF NOT EXISTS idx_graph_runs_initiative ON graph_runs (initiative_id);
CREATE INDEX IF NOT EXISTS idx_graph_runs_updated ON graph_runs (updated_at DESC);

-- graph_nodes: steps in the graph
CREATE TABLE IF NOT EXISTS graph_nodes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_run_id  uuid NOT NULL REFERENCES graph_runs(id) ON DELETE CASCADE,
  plan_node_id  uuid REFERENCES plan_nodes(id) ON DELETE SET NULL,
  job_type      text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  operator_id   uuid REFERENCES operators(id) ON DELETE SET NULL,
  priority      int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_run ON graph_nodes (graph_run_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_status ON graph_nodes (status);

-- graph_edges: dependencies between nodes
CREATE TABLE IF NOT EXISTS graph_edges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_run_id   uuid NOT NULL REFERENCES graph_runs(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  condition_json jsonb
);
CREATE INDEX IF NOT EXISTS idx_graph_edges_run ON graph_edges (graph_run_id);

-- node_executions: execution attempts per node
CREATE TABLE IF NOT EXISTS node_executions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     uuid NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  job_run_id  uuid REFERENCES job_runs(id) ON DELETE SET NULL,
  attempt     int NOT NULL DEFAULT 1,
  status      text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_json  jsonb
);
CREATE INDEX IF NOT EXISTS idx_node_executions_node ON node_executions (node_id);

-- graph_run_events: append-only event log
CREATE TABLE IF NOT EXISTS graph_run_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_run_id uuid NOT NULL REFERENCES graph_runs(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  payload_json jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_run_events_run ON graph_run_events (graph_run_id);
CREATE INDEX IF NOT EXISTS idx_graph_run_events_created ON graph_run_events (created_at DESC);

-- node_input_bindings: artifact ↔ node inputs
CREATE TABLE IF NOT EXISTS node_input_bindings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     uuid NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  input_key   text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_node_input_bindings_node ON node_input_bindings (node_id);

-- node_output_bindings: artifact ↔ node outputs
CREATE TABLE IF NOT EXISTS node_output_bindings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     uuid NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  output_key  text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_node_output_bindings_node ON node_output_bindings (node_id);

-- node_leases: worker leasing for execution
CREATE TABLE IF NOT EXISTS node_leases (
  node_id         uuid PRIMARY KEY REFERENCES graph_nodes(id) ON DELETE CASCADE,
  worker_id       text NOT NULL,
  lease_expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_node_leases_expires ON node_leases (lease_expires_at);

-- repair_attempts: node-level repair (Phase 6)
CREATE TABLE IF NOT EXISTS graph_repair_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id       uuid NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  failure_class text NOT NULL,
  strategy      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_repair_attempts_node ON graph_repair_attempts (node_id);

-- evaluation_results: evaluator results per artifact
CREATE TABLE IF NOT EXISTS evaluation_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id  uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  score        numeric,
  passed       boolean,
  feedback_json jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_artifact ON evaluation_results (artifact_id);

-- graph_run_checkpoints: checkpoint boundaries for resume/audit
CREATE TABLE IF NOT EXISTS graph_run_checkpoints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_run_id   uuid NOT NULL REFERENCES graph_runs(id) ON DELETE CASCADE,
  checkpoint_json jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_run_checkpoints_run ON graph_run_checkpoints (graph_run_id);

COMMIT;
