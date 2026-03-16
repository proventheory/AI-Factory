-- Graph OS Phase 4: intent_documents, intent_resolutions, build_specs, build_spec_nodes.

BEGIN;

-- intent_documents: raw user/system request
CREATE TABLE IF NOT EXISTS intent_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('chat', 'api', 'system', 'schedule')),
  source_ref  text,
  title       text,
  raw_text    text NOT NULL,
  context_json jsonb,
  status      text NOT NULL DEFAULT 'pending',
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intent_documents_status ON intent_documents(status);
CREATE INDEX IF NOT EXISTS idx_intent_documents_created ON intent_documents(created_at DESC);

-- intent_resolutions: typed resolution per ask (observability, audit)
CREATE TABLE IF NOT EXISTS intent_resolutions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_document_id uuid NOT NULL REFERENCES intent_documents(id) ON DELETE CASCADE,
  resolution_type   text NOT NULL CHECK (resolution_type IN ('graph_query', 'action', 'rejected', 'unknown')),
  confidence        float,
  requires_approval boolean NOT NULL DEFAULT false,
  graph_name        text,
  endpoint          text,
  params_json       jsonb,
  response_json     jsonb,
  status            text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'executed', 'rejected', 'failed')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intent_resolutions_intent ON intent_resolutions(intent_document_id);
CREATE INDEX IF NOT EXISTS idx_intent_resolutions_status ON intent_resolutions(status);

-- build_specs: compiled typed intent
CREATE TABLE IF NOT EXISTS build_specs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_document_id   uuid REFERENCES intent_documents(id) ON DELETE SET NULL,
  initiative_id       uuid REFERENCES initiatives(id) ON DELETE SET NULL,
  spec_version         text NOT NULL DEFAULT '1',
  goal_type            text,
  scope_json           jsonb,
  constraints_json     jsonb,
  acceptance_criteria_json jsonb,
  requested_outputs_json jsonb,
  status               text NOT NULL DEFAULT 'draft',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_build_specs_intent ON build_specs(intent_document_id);
CREATE INDEX IF NOT EXISTS idx_build_specs_initiative ON build_specs(initiative_id);
CREATE INDEX IF NOT EXISTS idx_build_specs_status ON build_specs(status);

-- build_spec_nodes: build spec -> graph nodes
CREATE TABLE IF NOT EXISTS build_spec_nodes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_spec_id   uuid NOT NULL REFERENCES build_specs(id) ON DELETE CASCADE,
  graph_node_id   uuid REFERENCES platform_graph_nodes(id) ON DELETE SET NULL,
  role_key       text NOT NULL,
  required_state text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (build_spec_id, role_key)
);
CREATE INDEX IF NOT EXISTS idx_build_spec_nodes_spec ON build_spec_nodes(build_spec_id);

COMMIT;
