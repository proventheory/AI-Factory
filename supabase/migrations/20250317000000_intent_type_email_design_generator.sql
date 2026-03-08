-- One-time: rename intent_type from email_campaign to email_design_generator so UI and API use the new label.
UPDATE initiatives
SET intent_type = 'email_design_generator'
WHERE intent_type = 'email_campaign';
