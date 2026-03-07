-- Image assignment persistence and template image contracts.
-- See docs/EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md and schemas/image_assignment.schema.json

-- Persist image assignment per run (canonical for render, logs, validations, proofing, debugging).
ALTER TABLE runs ADD COLUMN IF NOT EXISTS image_assignment_json jsonb;
COMMENT ON COLUMN runs.image_assignment_json IS 'Canonical ImageAssignment (see schemas/image_assignment.schema.json); set by runner after email_generate_mjml.';

-- Template image contracts: one row per template (versioned) for lint and validation.
CREATE TABLE IF NOT EXISTS template_image_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  version text NOT NULL DEFAULT 'v1',

  hero_required boolean NOT NULL DEFAULT true,
  logo_safe_hero boolean NOT NULL DEFAULT false,
  product_hero_allowed boolean NOT NULL DEFAULT false,

  hero_mode text NOT NULL DEFAULT 'full_bleed',
  supports_content_images boolean NOT NULL DEFAULT true,
  supports_product_images boolean NOT NULL DEFAULT false,
  mixed_content_and_product_pool boolean NOT NULL DEFAULT false,
  collapses_empty_modules boolean NOT NULL DEFAULT true,

  max_content_slots integer NOT NULL DEFAULT 0,
  max_product_slots integer NOT NULL DEFAULT 0,

  allowed_hero_sources jsonb NOT NULL DEFAULT '["campaign","brand_default"]'::jsonb,
  required_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  optional_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  repeatable_modules jsonb NOT NULL DEFAULT '[]'::jsonb,

  approved_placeholder_aliases jsonb NOT NULL DEFAULT '{}'::jsonb,
  lint_profile text NOT NULL DEFAULT 'standard_email',
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT template_image_contracts_template_id_version_key UNIQUE (template_id, version),
  CONSTRAINT template_image_contracts_hero_mode_check CHECK (
    hero_mode IN ('full_bleed', 'contained', 'none')
  ),
  CONSTRAINT template_image_contracts_max_content_slots_check CHECK (max_content_slots >= 0),
  CONSTRAINT template_image_contracts_max_product_slots_check CHECK (max_product_slots >= 0)
);

CREATE INDEX IF NOT EXISTS idx_template_image_contracts_template_id
  ON template_image_contracts (template_id);
CREATE INDEX IF NOT EXISTS idx_template_image_contracts_lint_profile
  ON template_image_contracts (lint_profile);

COMMENT ON TABLE template_image_contracts IS 'Per-template image contract for lint (L001–L010) and validation (V001–V012). Join with email_templates for proofing.';
