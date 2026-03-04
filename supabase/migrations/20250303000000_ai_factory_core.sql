-- AI Factory Core Schema
-- Implements the specification from sections 5.1-5.21, 5A-5E
-- Human-reviewed DDL; do not auto-generate or auto-migrate.

BEGIN;

-- ============================================================
-- Controlled vocabulary: enum types (Section 5B2)
-- ============================================================

CREATE TYPE run_status AS ENUM (
  'queued', 'running', 'succeeded', 'failed', 'rolled_back'
);

CREATE TYPE job_run_status AS ENUM (
  'queued', 'running', 'succeeded', 'failed'
);

CREATE TYPE tool_call_status AS ENUM (
  'pending', 'running', 'succeeded', 'failed'
);

CREATE TYPE environment_type AS ENUM (
  'sandbox', 'staging', 'prod'
);

CREATE TYPE cohort_type AS ENUM (
  'canary', 'control'
);

CREATE TYPE release_status AS ENUM (
  'draft', 'canary', 'promoted', 'rolled_back'
);

CREATE TYPE risk_level AS ENUM (
  'low', 'med', 'high'
);

CREATE TYPE node_type AS ENUM (
  'job', 'gate', 'approval', 'validator'
);

CREATE TYPE node_progress_status AS ENUM (
  'pending', 'eligible', 'running', 'succeeded', 'failed'
);

CREATE TYPE node_outcome_status AS ENUM (
  'succeeded', 'failed'
);

CREATE TYPE run_event_type AS ENUM (
  'queued', 'started', 'stage_entered', 'stage_exited',
  'succeeded', 'failed', 'rolled_back'
);

CREATE TYPE job_event_type AS ENUM (
  'attempt_started', 'attempt_succeeded', 'attempt_failed',
  'hypothesis_generated', 'patch_applied', 'escalated_model', 'halted'
);

CREATE TYPE artifact_class AS ENUM (
  'logs', 'docs', 'external_object_refs', 'schema_bundles', 'build_outputs'
);

CREATE TYPE approval_action AS ENUM (
  'approved', 'rejected'
);

CREATE TYPE validation_status AS ENUM (
  'pass', 'fail'
);

-- ============================================================
-- 5.1 initiatives
-- ============================================================

CREATE TABLE initiatives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_type   text        NOT NULL,
  title         text,
  risk_level    risk_level  NOT NULL,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_initiatives_created_at ON initiatives (created_at DESC);
CREATE INDEX idx_initiatives_intent_type ON initiatives (intent_type, created_at);
CREATE INDEX idx_initiatives_risk ON initiatives (risk_level);

-- ============================================================
-- 5.2 plans (compiled DAG)
-- ============================================================

CREATE TABLE plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id     uuid        NOT NULL REFERENCES initiatives(id),
  plan_hash         text        NOT NULL,
  deterministic_seed text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initiative_id, plan_hash)
);

CREATE INDEX idx_plans_initiative ON plans (initiative_id);
CREATE INDEX idx_plans_created_at ON plans (created_at DESC);

-- ============================================================
-- 5.3 plan_nodes
-- ============================================================

CREATE TABLE plan_nodes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           uuid      NOT NULL REFERENCES plans(id),
  node_key          text      NOT NULL,
  job_type          text      NOT NULL,
  node_type         node_type NOT NULL,
  input_schema_ref  text,
  output_schema_ref text,
  retry_policy_json jsonb,
  risk_level        risk_level,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, node_key)
);

CREATE INDEX idx_plan_nodes_plan ON plan_nodes (plan_id);

-- ============================================================
-- 5.4 plan_edges
-- ============================================================

CREATE TABLE plan_edges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES plans(id),
  from_node_id  uuid NOT NULL REFERENCES plan_nodes(id),
  to_node_id    uuid NOT NULL REFERENCES plan_nodes(id),
  condition     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, from_node_id, to_node_id, condition)
);

CREATE INDEX idx_plan_edges_plan ON plan_edges (plan_id);
CREATE INDEX idx_plan_edges_to   ON plan_edges (to_node_id);

-- ============================================================
-- 5.5 releases (rollout objects)
-- ============================================================

CREATE TABLE releases (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_plane_version    text,
  workplane_bundle_version text,
  runner_image_digest      text,
  policy_version           text,
  created_at               timestamptz    NOT NULL DEFAULT now(),
  status                   release_status NOT NULL DEFAULT 'draft',
  percent_rollout          int CHECK (percent_rollout BETWEEN 0 AND 100)
);

CREATE INDEX idx_releases_status     ON releases (status);
CREATE INDEX idx_releases_created_at ON releases (created_at DESC);

-- ============================================================
-- 5.5b release_routes (canary routing config)
-- ============================================================

CREATE TABLE release_routes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment  environment_type NOT NULL,
  rule_id      text             NOT NULL,
  release_id   uuid             NOT NULL REFERENCES releases(id),
  cohort       cohort_type      NOT NULL,
  percent      int              NOT NULL CHECK (percent BETWEEN 0 AND 100),
  constraints  jsonb,
  active_from  timestamptz,
  active_to    timestamptz
);

CREATE INDEX idx_release_routes_env     ON release_routes (environment);
CREATE INDEX idx_release_routes_release ON release_routes (release_id);
CREATE INDEX idx_release_routes_active  ON release_routes (active_from, active_to);

-- ============================================================
-- 5.11 policies (versioned, immutable) — placed before runs for FK
-- ============================================================

CREATE TABLE policies (
  version    text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  rules_json jsonb       NOT NULL
);

-- ============================================================
-- 5.6 runs (execution contexts)
-- ============================================================

CREATE TABLE runs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                   uuid             NOT NULL REFERENCES plans(id),
  release_id                uuid             NOT NULL REFERENCES releases(id),
  policy_version            text             REFERENCES policies(version),
  environment               environment_type NOT NULL,
  cohort                    cohort_type,
  status                    run_status       NOT NULL DEFAULT 'queued',
  started_at                timestamptz,
  ended_at                  timestamptz,
  root_idempotency_key      text             NOT NULL,
  routed_at                 timestamptz,
  routing_reason            text,
  routing_rule_id           text,
  prompt_template_version   text,
  adapter_contract_version  text,
  scheduler_lock_token      uuid,
  scheduler_lock_expires_at timestamptz,
  UNIQUE (environment, root_idempotency_key)
);

CREATE INDEX idx_runs_plan       ON runs (plan_id);
CREATE INDEX idx_runs_release    ON runs (release_id);
CREATE INDEX idx_runs_status     ON runs (status);
CREATE INDEX idx_runs_env_start  ON runs (environment, started_at DESC);
CREATE INDEX idx_runs_cohort     ON runs (cohort);
CREATE INDEX idx_runs_sched_lock ON runs (scheduler_lock_expires_at)
  WHERE scheduler_lock_expires_at IS NOT NULL;

-- ============================================================
-- 5.7 job_runs (Pattern A: one row per attempt)
-- ============================================================

CREATE TABLE job_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid           NOT NULL REFERENCES runs(id),
  plan_node_id      uuid           NOT NULL REFERENCES plan_nodes(id),
  attempt           int            NOT NULL DEFAULT 1,
  status            job_run_status NOT NULL DEFAULT 'queued',
  started_at        timestamptz,
  ended_at          timestamptz,
  error_signature   text,
  idempotency_key   text           NOT NULL,
  UNIQUE (run_id, plan_node_id, attempt)
);

CREATE INDEX idx_job_runs_run       ON job_runs (run_id);
CREATE INDEX idx_job_runs_status    ON job_runs (status);
CREATE INDEX idx_job_runs_node      ON job_runs (run_id, plan_node_id);
CREATE INDEX idx_job_runs_idemp     ON job_runs (idempotency_key);

-- ============================================================
-- 5.7b node_progress (dependency eligibility)
-- ============================================================

CREATE TABLE node_progress (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid                 NOT NULL REFERENCES runs(id),
  plan_node_id   uuid                 NOT NULL REFERENCES plan_nodes(id),
  deps_total     int                  NOT NULL,
  deps_satisfied int                  NOT NULL DEFAULT 0,
  eligible_at    timestamptz,
  status         node_progress_status NOT NULL DEFAULT 'pending',
  UNIQUE (run_id, plan_node_id)
);

CREATE INDEX idx_node_progress_run    ON node_progress (run_id);
CREATE INDEX idx_node_progress_status ON node_progress (status);
CREATE INDEX idx_node_progress_elig   ON node_progress (eligible_at);

-- ============================================================
-- 5.7b2 node_completions (idempotent dep ledger)
-- ============================================================

CREATE TABLE node_completions (
  run_id       uuid        NOT NULL REFERENCES runs(id),
  from_node_id uuid        NOT NULL REFERENCES plan_nodes(id),
  job_run_id   uuid        NOT NULL REFERENCES job_runs(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, from_node_id)
);

CREATE INDEX idx_node_completions_run  ON node_completions (run_id);
CREATE INDEX idx_node_completions_node ON node_completions (from_node_id);

-- ============================================================
-- 5.7c node_outcomes (single-winner election)
-- ============================================================

CREATE TABLE node_outcomes (
  run_id              uuid               NOT NULL REFERENCES runs(id),
  plan_node_id        uuid               NOT NULL REFERENCES plan_nodes(id),
  outcome_status      node_outcome_status NOT NULL,
  winning_job_run_id  uuid               NOT NULL REFERENCES job_runs(id),
  UNIQUE (run_id, plan_node_id)
);

CREATE INDEX idx_node_outcomes_run    ON node_outcomes (run_id);
CREATE INDEX idx_node_outcomes_winner ON node_outcomes (winning_job_run_id);

-- ============================================================
-- 5.13 adapters (MCP / tool registry) — before tool_calls for FK
-- ============================================================

CREATE TABLE adapters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  version             text        NOT NULL,
  capabilities        text[]      NOT NULL,
  schema_contract_ref text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_adapters_name_ver ON adapters (name, version);

-- ============================================================
-- 5.10 artifacts (typed outputs) — before tool_calls for FK
-- ============================================================

CREATE TABLE artifacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid           NOT NULL REFERENCES runs(id),
  job_run_id     uuid           REFERENCES job_runs(id),
  artifact_type  text           NOT NULL,
  artifact_class artifact_class NOT NULL,
  uri            text           NOT NULL,
  sha256         text,
  metadata_json  jsonb,
  created_at     timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_artifacts_run_type  ON artifacts (run_id, artifact_type);
CREATE INDEX idx_artifacts_class     ON artifacts (artifact_class);

-- ============================================================
-- 5.8 tool_calls (adapter invocations)
-- ============================================================

CREATE TABLE tool_calls (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_run_id           uuid             NOT NULL REFERENCES job_runs(id),
  adapter_id           uuid             NOT NULL REFERENCES adapters(id),
  capability           text             NOT NULL,
  operation_key        text             NOT NULL,
  idempotency_key      text             NOT NULL,
  request_hash         text,
  request_schema_ref   text,
  response_schema_ref  text,
  request_artifact_id  uuid             REFERENCES artifacts(id),
  response_artifact_id uuid             REFERENCES artifacts(id),
  status               tool_call_status NOT NULL DEFAULT 'pending',
  started_at           timestamptz,
  ended_at             timestamptz,
  UNIQUE (adapter_id, idempotency_key),
  UNIQUE (adapter_id, capability, operation_key)
);

CREATE INDEX idx_tool_calls_job_run ON tool_calls (job_run_id);
CREATE INDEX idx_tool_calls_status  ON tool_calls (status);

-- ============================================================
-- 5.9 validations
-- ============================================================

CREATE TABLE validations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_run_id         uuid              REFERENCES job_runs(id),
  run_id             uuid              REFERENCES runs(id),
  validator_type     text              NOT NULL,
  status             validation_status NOT NULL,
  report_artifact_id uuid              REFERENCES artifacts(id),
  created_at         timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX idx_validations_job_run   ON validations (job_run_id);
CREATE INDEX idx_validations_run       ON validations (run_id);
CREATE INDEX idx_validations_validator ON validations (validator_type);

-- ============================================================
-- 5.12 secret_refs (vault pointers)
-- ============================================================

CREATE TABLE secret_refs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text             NOT NULL,
  vault_path           text             NOT NULL,
  scope                environment_type NOT NULL,
  capabilities_allowed text[],
  rotated_at           timestamptz
);

CREATE INDEX idx_secret_refs_name  ON secret_refs (name);
CREATE INDEX idx_secret_refs_scope ON secret_refs (scope);

-- ============================================================
-- 5.12b secret_access_events (append-only audit)
-- ============================================================

CREATE TABLE secret_access_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  secret_ref_id uuid             NOT NULL REFERENCES secret_refs(id),
  environment   environment_type NOT NULL,
  job_run_id    uuid             REFERENCES job_runs(id),
  tool_call_id  uuid             REFERENCES tool_calls(id),
  worker_id     text             NOT NULL,
  accessed_at   timestamptz      NOT NULL DEFAULT now(),
  purpose       text
);

CREATE INDEX idx_secret_access_ref  ON secret_access_events (secret_ref_id, accessed_at);
CREATE INDEX idx_secret_access_env  ON secret_access_events (environment, accessed_at);
CREATE INDEX idx_secret_access_job  ON secret_access_events (job_run_id);
CREATE INDEX idx_secret_access_tool ON secret_access_events (tool_call_id);

-- ============================================================
-- 5.14 run_events (append-only)
-- ============================================================

CREATE TABLE run_events (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id               uuid           NOT NULL REFERENCES runs(id),
  event_type           run_event_type NOT NULL,
  payload_artifact_id  uuid           REFERENCES artifacts(id),
  created_at           timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_run_events_run ON run_events (run_id, created_at);

-- ============================================================
-- 5.15 job_events (append-only)
-- ============================================================

CREATE TABLE job_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_run_id   uuid           NOT NULL REFERENCES job_runs(id),
  event_type   job_event_type NOT NULL,
  payload_json jsonb,
  created_at   timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_events_job ON job_events (job_run_id, created_at);

-- ============================================================
-- 5.16 capability_grants
-- ============================================================

CREATE TABLE capability_grants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment       environment_type NOT NULL,
  release_id        uuid             REFERENCES releases(id),
  adapter_id        uuid             NOT NULL REFERENCES adapters(id),
  capability        text             NOT NULL,
  requires_approval boolean          NOT NULL DEFAULT false,
  max_qps           int,
  max_daily_actions int,
  created_at        timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX idx_cap_grants_env ON capability_grants (environment, adapter_id, capability);

-- ============================================================
-- 5.17 approvals (append-only ledger)
-- ============================================================

CREATE TABLE approvals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     uuid            NOT NULL REFERENCES runs(id),
  job_run_id uuid            REFERENCES job_runs(id),
  approver   text            NOT NULL,
  action     approval_action NOT NULL,
  created_at timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX idx_approvals_run ON approvals (run_id);
CREATE INDEX idx_approvals_at  ON approvals (created_at);

-- ============================================================
-- 5.18 job_claims (leases — exactly-once execution)
-- ============================================================

CREATE TABLE job_claims (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_run_id       uuid        NOT NULL REFERENCES job_runs(id),
  worker_id        text        NOT NULL,
  claim_token      uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  claimed_at       timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,
  heartbeat_at     timestamptz NOT NULL DEFAULT now(),
  attempt_token    text,
  released_at      timestamptz
);

CREATE UNIQUE INDEX idx_job_claims_active
  ON job_claims (job_run_id) WHERE released_at IS NULL;
CREATE INDEX idx_job_claims_worker    ON job_claims (worker_id, heartbeat_at);
CREATE INDEX idx_job_claims_lease_exp ON job_claims (lease_expires_at);

-- ============================================================
-- 5.19 worker_registry (optional)
-- ============================================================

CREATE TABLE worker_registry (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id        text        NOT NULL UNIQUE,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  runner_version   text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5.20 repair_recipes (repair knowledge base)
-- ============================================================

CREATE TABLE repair_recipes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_signature        text        NOT NULL,
  job_type               text,
  adapter_id             uuid        REFERENCES adapters(id),
  capability             text,
  patch_pattern          text        NOT NULL,
  validation_required    text        NOT NULL,
  created_from_job_run_id uuid       REFERENCES job_runs(id),
  success_count          int         NOT NULL DEFAULT 0,
  failure_count          int         NOT NULL DEFAULT 0,
  last_used_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_repair_recipes_sig     ON repair_recipes (error_signature);
CREATE INDEX idx_repair_recipes_type    ON repair_recipes (job_type, adapter_id);
CREATE INDEX idx_repair_recipes_used    ON repair_recipes (last_used_at DESC);

-- ============================================================
-- 5.21 llm_calls (optional — model escalation audit)
-- ============================================================

CREATE TABLE llm_calls (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  uuid        NOT NULL REFERENCES runs(id),
  job_run_id              uuid        NOT NULL REFERENCES job_runs(id),
  model_tier              text        NOT NULL,
  model_id                text        NOT NULL,
  prompt_template_version text,
  tool_registry_version   text,
  tokens_in               int,
  tokens_out              int,
  latency_ms              int,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_llm_calls_run   ON llm_calls (run_id);
CREATE INDEX idx_llm_calls_job   ON llm_calls (job_run_id);
CREATE INDEX idx_llm_calls_model ON llm_calls (model_tier);
CREATE INDEX idx_llm_calls_at    ON llm_calls (created_at DESC);

-- ============================================================
-- 5E rollback_targets (Option A)
-- ============================================================

CREATE TABLE rollback_targets (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id                 uuid        NOT NULL REFERENCES artifacts(id),
  run_id                      uuid        NOT NULL REFERENCES runs(id),
  rollback_strategy           text        NOT NULL,
  rollback_pointer            jsonb       NOT NULL,
  rollback_pointer_artifact_id uuid       REFERENCES artifacts(id),
  verified_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rollback_targets_run ON rollback_targets (run_id);

COMMIT;
