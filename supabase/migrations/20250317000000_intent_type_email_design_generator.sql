-- One-time: rename intent_type from email_campaign to email_design_generator so UI and API use the new label.
UPDATE initiatives
SET intent_type = 'email_design_generator'
WHERE intent_type = 'email_campaign';

-- Update table comment to match (email_campaign_metadata is still the table name).
COMMENT ON TABLE email_campaign_metadata IS 'Campaign-level fields for initiatives with intent_type = email_design_generator (subject, from, template ref, metadata_json).';
