-- Graph OS Phase 3: operator_definitions + contracts, saved_flows + versions + bindings.

BEGIN;

-- operator_definitions: atomic executable producers
CREATE TABLE IF NOT EXISTS operator_definitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key               text UNIQUE NOT NULL,
  display_name      text,
  description       text,
  version           text NOT NULL DEFAULT '1',
  handler_key       text NOT NULL,
  determinism_level text CHECK (determinism_level IN ('strict', 'bounded', 'probabilistic')),
  status            text NOT NULL DEFAULT 'active',
  config_json       jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_operator_definitions_key ON operator_definitions(key);
CREATE INDEX IF NOT EXISTS idx_operator_definitions_status ON operator_definitions(status);

-- operator_input_contracts: typed inputs per operator
CREATE TABLE IF NOT EXISTS operator_input_contracts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_definition_id uuid NOT NULL REFERENCES operator_definitions(id) ON DELETE CASCADE,
  input_key            text NOT NULL,
  artifact_type        text,
  node_kind_key        text,
  required             boolean NOT NULL DEFAULT true,
  schema_json          jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_definition_id, input_key)
);
CREATE INDEX IF NOT EXISTS idx_operator_input_contracts_operator ON operator_input_contracts(operator_definition_id);

-- operator_output_contracts: typed outputs per operator
CREATE TABLE IF NOT EXISTS operator_output_contracts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_definition_id uuid NOT NULL REFERENCES operator_definitions(id) ON DELETE CASCADE,
  output_key           text NOT NULL,
  artifact_type        text,
  node_kind_key        text,
  schema_json          jsonb,
  is_primary            boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_definition_id, output_key)
);
CREATE INDEX IF NOT EXISTS idx_operator_output_contracts_operator ON operator_output_contracts(operator_definition_id);

-- operator_capability_bindings: who can produce what (resolution)
CREATE TABLE IF NOT EXISTS operator_capability_bindings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_definition_id uuid NOT NULL REFERENCES operator_definitions(id) ON DELETE CASCADE,
  capability_key        text NOT NULL,
  artifact_type         text,
  node_kind_key         text,
  priority              int NOT NULL DEFAULT 0,
  is_default            boolean NOT NULL DEFAULT false,
  policy_json           jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_operator_capability_bindings_operator ON operator_capability_bindings(operator_definition_id);
CREATE INDEX IF NOT EXISTS idx_operator_capability_bindings_capability ON operator_capability_bindings(capability_key);

-- saved_flows: named reusable flows
CREATE TABLE IF NOT EXISTS saved_flows (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 text UNIQUE NOT NULL,
  name                text,
  description         text,
  source_type         text,
  source_ref          text,
  input_schema_json   jsonb,
  default_params_json jsonb,
  output_targets_json jsonb,
  invocation_mode     text CHECK (invocation_mode IN ('manual', 'scheduled', 'evented')),
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_flows_key ON saved_flows(key);
CREATE INDEX IF NOT EXISTS idx_saved_flows_status ON saved_flows(status);

-- saved_flow_versions: versioned flow definition
CREATE TABLE IF NOT EXISTS saved_flow_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_flow_id uuid NOT NULL REFERENCES saved_flows(id) ON DELETE CASCADE,
  version      text NOT NULL,
  draft_json   jsonb NOT NULL,
  is_current   boolean NOT NULL DEFAULT false,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (saved_flow_id, version)
);
CREATE INDEX IF NOT EXISTS idx_saved_flow_versions_flow ON saved_flow_versions(saved_flow_id);
CREATE INDEX IF NOT EXISTS idx_saved_flow_versions_current ON saved_flow_versions(saved_flow_id, is_current) WHERE is_current = true;

-- saved_flow_bindings: flow -> operator bindings
CREATE TABLE IF NOT EXISTS saved_flow_bindings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_flow_id        uuid NOT NULL REFERENCES saved_flows(id) ON DELETE CASCADE,
  operator_definition_id uuid REFERENCES operator_definitions(id) ON DELETE SET NULL,
  binding_key          text NOT NULL,
  binding_json         jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_flow_bindings_flow ON saved_flow_bindings(saved_flow_id);

COMMIT;
