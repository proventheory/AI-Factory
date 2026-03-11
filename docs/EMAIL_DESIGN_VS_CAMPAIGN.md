# Email design vs email campaign (naming)

This doc clarifies naming so we don’t block the future “email campaign” (sent to Klaviyo, etc.) concept.

## Current: Email Design Generator

- **Intent type:** `email_design_generator`
- **Console:** **Email Design Generator** (initiatives that create an email design: brand → template → generate).
- **API:** `/v1/email_designs` — list, get, create, and update these *design* initiatives and their metadata (subject, from, template).
- **Table:** `email_design_generator_metadata` — one row per design initiative (subject_line, from_name, template ref, metadata_json). The product term "email campaign" is reserved for future sent campaigns (e.g. Klaviyo).

## Email campaign (sent) — Klaviyo operator pack

- **Implemented:** The **Klaviyo operator pack** (Phases 1–4) implements design sent as campaign: push artifact to template and campaign (optional schedule), plus flow drafting and status. See **KLAVIYO_OPERATOR_PACK.md** for API, Console `/klaviyo`, migrations, and testing.
- **Do not:** Use `email_campaign` as an `initiatives.intent_type` value; use Klaviyo APIs or Console **Push to Klaviyo** instead.
- **Tables:** `klaviyo_template_sync`, `klaviyo_sent_campaigns`, `klaviyo_flow_sync`, and related tables plus the Klaviyo API/Console handle design-sent-as-campaign; `email_design_generator` and `email_design_generator_metadata` remain for the design side only.

## Summary

| Concept              | Intent type / usage        | Notes                                      |
|----------------------|----------------------------|--------------------------------------------|
| Email design         | `email_design_generator`   | Initiative in the generator; current flow. |
| Email campaign (sent) | Klaviyo operator pack     | Design sent as campaign via Klaviyo; see KLAVIYO_OPERATOR_PACK.md. |
