-- Graph & self-heal: deploy_events, incident_memory, memory_entries, graph_checkpoints,
-- change_events, graph_impacts, repair_runs, build_repair_actions, build_config_snapshots, import_graph_snapshots.
-- Enables Console Graph & self-heal pages and Control Plane APIs.

BEGIN;

-- deploy_events: build/deploy outcomes (from Render, GitHub Actions, or POST)
CREATE TABLE IF NOT EXISTS deploy_events (
  deploy_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_event_id      uuid,
  service_id           text,
  commit_sha           text,
  status               text NOT NULL,
  failure_class        text,
  error_signature      text,
  external_deploy_id   text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deploy_events_service_id ON deploy_events (service_id);
CREATE INDEX IF NOT EXISTS idx_deploy_events_status ON deploy_events (status);
CREATE INDEX IF NOT EXISTS idx_deploy_events_created_at ON deploy_events (created_at DESC);

-- incident_memory: failure signatures and resolutions (used by repair plan and decision loop)
CREATE TABLE IF NOT EXISTS incident_memory (
  memory_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_signature  text NOT NULL,
  failure_class      text NOT NULL,
  resolution         text NOT NULL,
  confidence         numeric(3,2) NOT NULL DEFAULT 0.8,
  times_seen         int NOT NULL DEFAULT 1,
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incident_memory_failure_class ON incident_memory (failure_class);
CREATE INDEX IF NOT EXISTS idx_incident_memory_last_seen ON incident_memory (last_seen_at DESC);

-- memory_entries: generic memory (incident, repair_recipe, failure_pattern) for decision loop / lookup
CREATE TABLE IF NOT EXISTS memory_entries (
  memory_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_type     text NOT NULL,
  scope_type      text,
  scope_key       text,
  title           text,
  summary         text,
  signature_json  jsonb,
  evidence_json   jsonb,
  resolution_json jsonb,
  confidence      numeric(3,2) DEFAULT 0.8,
  times_seen      int NOT NULL DEFAULT 1,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memory_entries_type_scope ON memory_entries (memory_type, scope_key);
CREATE INDEX IF NOT EXISTS idx_memory_entries_last_seen ON memory_entries (last_seen_at DESC);

-- graph_checkpoints: known-good snapshots per scope (for checkpoint diff, migration guard)
CREATE TABLE IF NOT EXISTS graph_checkpoints (
  checkpoint_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type                   text NOT NULL,
  scope_id                     text NOT NULL,
  run_id                       uuid REFERENCES runs(id) ON DELETE SET NULL,
  schema_snapshot_artifact_id  uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  contract_snapshot_artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  config_snapshot_artifact_id  uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_checkpoints_scope ON graph_checkpoints (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_graph_checkpoints_created ON graph_checkpoints (created_at DESC);

-- change_events: migration, code_commit, config_edit (for change impact and backfill plan)
CREATE TABLE IF NOT EXISTS change_events (
  change_event_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type      text NOT NULL,
  source_ref       text,
  change_class     text NOT NULL,
  summary          text,
  diff_artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_change_events_created ON change_events (created_at DESC);

-- graph_impacts: affected plan nodes / runs for a change event
CREATE TABLE IF NOT EXISTS graph_impacts (
  impact_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_event_id  uuid NOT NULL REFERENCES change_events(change_event_id) ON DELETE CASCADE,
  run_id           uuid REFERENCES runs(id) ON DELETE SET NULL,
  plan_id          uuid REFERENCES plans(id) ON DELETE SET NULL,
  plan_node_id     uuid REFERENCES plan_nodes(id) ON DELETE SET NULL,
  artifact_id      uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  impact_type      text NOT NULL,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_graph_impacts_change_event ON graph_impacts (change_event_id);

-- repair_runs: subgraph replay / repair execution log
CREATE TABLE IF NOT EXISTS repair_runs (
  repair_run_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_memory_id      uuid REFERENCES incident_memory(memory_id) ON DELETE SET NULL,
  root_node_id            uuid NOT NULL REFERENCES plan_nodes(id) ON DELETE CASCADE,
  run_id                  uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  repair_strategy         text NOT NULL DEFAULT 'replay_subgraph',
  repair_plan_artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  status                  text NOT NULL DEFAULT 'running',
  started_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repair_runs_run_id ON repair_runs (run_id);
CREATE INDEX IF NOT EXISTS idx_repair_runs_status ON repair_runs (status);

-- build_repair_actions: registered actions for deploy repair plan (optional seed)
CREATE TABLE IF NOT EXISTS build_repair_actions (
  action_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_key        text NOT NULL UNIQUE,
  label             text NOT NULL,
  description       text,
  risk_level        text NOT NULL DEFAULT 'low',
  requires_approval boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_build_repair_actions_key ON build_repair_actions (action_key);

-- build_config_snapshots: per-service deps/externals for repair plan (optional)
CREATE TABLE IF NOT EXISTS build_config_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id        text NOT NULL,
  dependencies_json jsonb,
  externals_json    jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_build_config_snapshots_service ON build_config_snapshots (service_id);

-- import_graph_snapshots: per-service module graph for deploy repair (suggest files from import graph)
CREATE TABLE IF NOT EXISTS import_graph_snapshots (
  snapshot_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    text NOT NULL,
  snapshot_json jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_graph_snapshots_service ON import_graph_snapshots (service_id);
CREATE INDEX IF NOT EXISTS idx_import_graph_snapshots_created ON import_graph_snapshots (service_id, created_at DESC);

COMMIT;
