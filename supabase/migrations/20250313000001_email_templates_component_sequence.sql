-- Allow email templates to be composed from email_component_library fragments.
-- When non-null, GET /v1/email_templates/:id returns assembled MJML from fragments instead of stored mjml.

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS component_sequence jsonb DEFAULT NULL;
COMMENT ON COLUMN email_templates.component_sequence IS 'Optional array of email_component_library.id UUIDs; when set, template MJML is assembled from these fragments in order.';
