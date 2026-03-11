-- Launch kernel: build_specs and launches tables.
-- Required for GET /v1/launches, GET /v1/build_specs and related Console pages.
-- Run after initiatives exist (ai_factory_core).

BEGIN;

-- build_specs: one per initiative (or more if from_strategy creates multiple).
CREATE TABLE IF NOT EXISTS build_specs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid        NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  spec_json     jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_build_specs_initiative ON build_specs (initiative_id);
CREATE INDEX IF NOT EXISTS idx_build_specs_created_at ON build_specs (created_at DESC);

-- launches: one per build_spec (or placeholder per initiative).
CREATE TABLE IF NOT EXISTS launches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id        uuid        NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  status              text        NOT NULL DEFAULT 'draft',
  build_spec_id       uuid        REFERENCES build_specs(id) ON DELETE SET NULL,
  artifact_id         uuid        NULL,
  deploy_url          text        NULL,
  deploy_id           text        NULL,
  domain              text        NULL,
  verification_status text        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_launches_initiative ON launches (initiative_id);
CREATE INDEX IF NOT EXISTS idx_launches_build_spec ON launches (build_spec_id) WHERE build_spec_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_launches_created_at ON launches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_launches_status ON launches (status);

COMMENT ON TABLE build_specs IS 'Launch kernel: build spec per initiative (static site deploy, domain intent, etc.).';
COMMENT ON TABLE launches IS 'Launch kernel: deploy lifecycle (preview, domain attach, validation).';

COMMIT;
