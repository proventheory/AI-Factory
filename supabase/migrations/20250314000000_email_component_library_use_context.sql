-- Add use_context to email_component_library: 'email' | 'deck' | 'report' etc.
ALTER TABLE email_component_library
  ADD COLUMN IF NOT EXISTS use_context text NOT NULL DEFAULT 'email';

COMMENT ON COLUMN email_component_library.use_context IS 'Where this component is used: email, deck, report, etc.';

CREATE INDEX IF NOT EXISTS idx_email_component_library_use_context ON email_component_library (use_context);
