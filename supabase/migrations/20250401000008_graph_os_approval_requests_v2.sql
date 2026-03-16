-- Graph-aware approval requests (Phase 6 optional). Links to graph_node_id, operator, action_key.

BEGIN;

CREATE TABLE IF NOT EXISTS approval_requests_v2 (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_node_id         uuid REFERENCES platform_graph_nodes(id) ON DELETE SET NULL,
  operator_definition_id uuid REFERENCES operator_definitions(id) ON DELETE SET NULL,
  action_key            text NOT NULL,
  reason                text,
  requested_by          text NOT NULL,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_by           text,
  resolved_at           timestamptz,
  metadata_json         jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_v2_status ON approval_requests_v2(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_v2_node ON approval_requests_v2(graph_node_id);

COMMIT;
