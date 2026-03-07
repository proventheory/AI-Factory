-- Optional constraints and trigger for template_image_contracts (from reference migration).
-- Ensures jsonb columns have expected type and adds updated_at trigger.
-- See docs/EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md

-- CHECK constraints for jsonb columns (idempotent: drop if exists then add)
ALTER TABLE template_image_contracts
  DROP CONSTRAINT IF EXISTS template_image_contracts_allowed_hero_sources_is_array;
ALTER TABLE template_image_contracts
  ADD CONSTRAINT template_image_contracts_allowed_hero_sources_is_array
  CHECK (jsonb_typeof(allowed_hero_sources) = 'array');

ALTER TABLE template_image_contracts
  DROP CONSTRAINT IF EXISTS template_image_contracts_required_modules_is_array;
ALTER TABLE template_image_contracts
  ADD CONSTRAINT template_image_contracts_required_modules_is_array
  CHECK (jsonb_typeof(required_modules) = 'array');

ALTER TABLE template_image_contracts
  DROP CONSTRAINT IF EXISTS template_image_contracts_optional_modules_is_array;
ALTER TABLE template_image_contracts
  ADD CONSTRAINT template_image_contracts_optional_modules_is_array
  CHECK (jsonb_typeof(optional_modules) = 'array');

ALTER TABLE template_image_contracts
  DROP CONSTRAINT IF EXISTS template_image_contracts_repeatable_modules_is_array;
ALTER TABLE template_image_contracts
  ADD CONSTRAINT template_image_contracts_repeatable_modules_is_array
  CHECK (jsonb_typeof(repeatable_modules) = 'array');

ALTER TABLE template_image_contracts
  DROP CONSTRAINT IF EXISTS template_image_contracts_approved_placeholder_aliases_is_object;
ALTER TABLE template_image_contracts
  ADD CONSTRAINT template_image_contracts_approved_placeholder_aliases_is_object
  CHECK (jsonb_typeof(approved_placeholder_aliases) = 'object');

-- Optional GIN indexes for jsonb (useful if querying by contained keys/values)
CREATE INDEX IF NOT EXISTS idx_template_image_contracts_allowed_hero_sources_gin
  ON template_image_contracts USING gin (allowed_hero_sources);
CREATE INDEX IF NOT EXISTS idx_template_image_contracts_required_modules_gin
  ON template_image_contracts USING gin (required_modules);
CREATE INDEX IF NOT EXISTS idx_template_image_contracts_optional_modules_gin
  ON template_image_contracts USING gin (optional_modules);
CREATE INDEX IF NOT EXISTS idx_template_image_contracts_repeatable_modules_gin
  ON template_image_contracts USING gin (repeatable_modules);
CREATE INDEX IF NOT EXISTS idx_template_image_contracts_approved_placeholder_aliases_gin
  ON template_image_contracts USING gin (approved_placeholder_aliases);

-- Trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION set_template_image_contracts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_template_image_contracts_updated_at ON template_image_contracts;
CREATE TRIGGER trg_template_image_contracts_updated_at
  BEFORE UPDATE ON template_image_contracts
  FOR EACH ROW
  EXECUTE FUNCTION set_template_image_contracts_updated_at();
