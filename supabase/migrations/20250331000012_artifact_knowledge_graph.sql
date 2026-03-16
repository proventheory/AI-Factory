-- Artifact / Knowledge Graph: derived_from (artifact→artifact), scope (belongs_to), part_of project, referenced_by page.
-- Gets artifact lineage to 100%: explicit edges for derived_from, scope, and page references.

BEGIN;

-- artifact → derived_from → artifact (explicit parent artifact)
ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS derived_from_artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_derived_from ON artifacts (derived_from_artifact_id) WHERE derived_from_artifact_id IS NOT NULL;

-- artifact belongs_to scope (run, initiative, or project)
ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS scope_type text,
  ADD COLUMN IF NOT EXISTS scope_id text;
CREATE INDEX IF NOT EXISTS idx_artifacts_scope ON artifacts (scope_type, scope_id) WHERE scope_type IS NOT NULL AND scope_id IS NOT NULL;

-- referenced_by page: which pages reference this artifact (page_ref = URL or page identifier)
CREATE TABLE IF NOT EXISTS artifact_page_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  page_ref text NOT NULL,
  ref_type text NOT NULL DEFAULT 'page',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, page_ref)
);
CREATE INDEX IF NOT EXISTS idx_artifact_page_refs_artifact ON artifact_page_references (artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_page_refs_page ON artifact_page_references (page_ref);

COMMENT ON COLUMN artifacts.derived_from_artifact_id IS 'Artifact/Knowledge graph: this artifact was derived from another (e.g. image from prompt).';
COMMENT ON COLUMN artifacts.scope_type IS 'Artifact/Knowledge graph: scope of ownership; one of run, initiative, project.';
COMMENT ON COLUMN artifacts.scope_id IS 'Artifact/Knowledge graph: scope entity id (run_id, initiative_id, or project_id).';
COMMENT ON TABLE artifact_page_references IS 'Artifact/Knowledge graph: which pages reference this artifact (referenced_by).';

COMMIT;
