# Email design vs email campaign (naming)

This doc clarifies naming so we don’t block the future “email campaign” (sent to Klaviyo, etc.) concept.

## Current: Email Design Generator

- **Intent type:** `email_design_generator`
- **Console:** **Email Design Generator** (initiatives that create an email design: brand → template → generate).
- **API:** `/v1/email_designs` — list, get, create, and update these *design* initiatives and their metadata (subject, from, template).
- **Table:** `email_design_generator_metadata` — one row per design initiative (subject_line, from_name, template ref, metadata_json). The product term "email campaign" is reserved for future sent campaigns (e.g. Klaviyo).

## Future: Email campaign (sent)

- **Reserved:** The term **email campaign** is reserved for the future concept: an email *design* (from the generator) that is sent or scheduled as a campaign, e.g. to Klaviyo.
- **Do not:** Use `email_campaign` as an `initiatives.intent_type` value. That would collide with the future “sent campaign” idea.
- **When we add it:** We may introduce a separate table (e.g. sent campaigns, Klaviyo sync) and/or API for “design sent as campaign” and keep `email_design_generator` + `email_design_generator_metadata` for the design side only.

## Summary

| Concept              | Intent type / usage        | Notes                                      |
|----------------------|----------------------------|--------------------------------------------|
| Email design         | `email_design_generator`   | Initiative in the generator; current flow. |
| Email campaign (future) | Reserved                | Design sent as campaign (e.g. Klaviyo).    |
