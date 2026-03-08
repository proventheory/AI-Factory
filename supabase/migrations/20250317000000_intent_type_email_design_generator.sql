-- One-time: rename intent_type from email_campaign to email_design_generator so UI and API use the new label.
UPDATE initiatives
SET intent_type = 'email_design_generator'
WHERE intent_type = 'email_campaign';

-- Table comment: this is metadata for the *design* initiative (email_design_generator), not for the future "sent campaign" concept (Klaviyo etc.).
COMMENT ON TABLE email_campaign_metadata IS 'Metadata for email-design initiatives (intent_type = email_design_generator): subject, from, template ref, metadata_json. Name is historical; "email campaign" reserved for future sent-campaign concept.';
