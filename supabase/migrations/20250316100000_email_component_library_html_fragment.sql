-- Landing-page (and other non-email) components: store HTML instead of MJML.
-- use_context = 'landing_page' typically uses html_fragment (e.g. footer from WordPress/PHP).
-- mjml_fragment remains for email; for landing_page it can be null.

ALTER TABLE email_component_library
  ADD COLUMN IF NOT EXISTS html_fragment text;

ALTER TABLE email_component_library
  ALTER COLUMN mjml_fragment DROP NOT NULL;

COMMENT ON COLUMN email_component_library.html_fragment IS 'For use_context landing_page etc.: raw HTML fragment. Placeholders as {{name}}. Not for email.';
COMMENT ON COLUMN email_component_library.mjml_fragment IS 'MJML section/column fragment for email. Null when component is HTML-only (e.g. landing_page).';
