# Debug: Empty email artifact — 10 hypotheses

When the email artifact preview is empty (boilerplate only, broken image placeholder, or "Introducing Emma" at bottom), use this map to confirm or reject each cause. **Always grep by `run_id`** (e.g. `9b2de7f2-4cf6-40f0-bc05-291a35a77631`) in Render runner logs to see the full flow for that run.

---

## H1. Schema: `initiatives` missing columns

**Cause:** DB has no `brand_profile_id` or `template_id` on `initiatives`. Campaign creation or plan load fails or falls back; runner may get no template.

**Where:** Control plane (API + plan compiler), not runner.

**Log evidence:**
- `column "brand_profile_id" of relation "initiatives" does not exist` (POST email_campaigns)
- `column "template_id" does not exist` (plan-compiler fullSelect) then minimalSelect succeeded

**Fix:** Run migrations so `initiatives` has `brand_profile_id` and `template_id`. See `docs/SUPABASE_EMAIL_SCHEMA_DEPLOY.md` and `scripts/run-email-templates-migration.mjs`.

---

## H2. Runner never receives `initiative_id`

**Cause:** Scheduler or job payload doesn’t include `initiative_id`; runner can’t load campaign or brand.

**Log evidence (runner):**
- `[MJML] entry (H10)` with `initiative_id: "(none)"`
- `[MJML] no initiative_id (H2)` with `run_id`, `input_keys`
- If fallback works: `[MJML] initiative_id from run fallback (H2)` with `initiative_id`

**Fix:** Ensure plan/run payload passed to runner includes `initiative_id`; or rely on run fallback (GET /v1/runs/:runId) if control plane and runner share same DB/view.

---

## H3. Runner can’t reach Control Plane

**Cause:** Wrong or unreachable `CONTROL_PLANE_URL`; campaign/template/run fetches fail.

**Log evidence (runner):**
- `[MJML] run fallback failed (H3)` — run fetch failed
- `[MJML] campaign fetch failed` (in catch)
- `[MJML] template fetch failed (H3/H5)` — template fetch exception

**Fix:** Set `CONTROL_PLANE_URL` on the runner to the correct API base (e.g. `https://ai-factory-api-staging.onrender.com`). Check network/firewall if URL is correct.

---

## H4. Campaign returns no `template_id`

**Cause:** Campaign metadata not saved, or wrong initiative; runner gets no `template_id` and skips template path.

**Log evidence (runner):**
- `[MJML] no template_id (H4)` with `run_id`, `input_keys`, `template_id`
- `[MJML] campaign fetch (H3/H4)` with `template_id: undefined` or missing

**Fix:** Ensure POST email_campaigns stores `template_id` (and products/campaign_prompt) in `email_campaign_metadata.metadata_json` or on the initiative row. Run schema migrations (H1). Confirm initiative_id in logs matches the campaign you created.

---

## H5. Template fetch fails (404/500)

**Cause:** GET /v1/email_templates/:id returns non-ok; runner has no MJML.

**Log evidence (runner):**
- `[MJML] template fetch not ok (H5)` with `run_id`, `template_id`, `status`
- `[MJML] template fetch failed (H3/H5)` with `err`

**Fix:** Confirm `template_id` is a valid UUID that exists in `email_templates`. Check control plane logs for 404/500 on GET email_templates.

---

## H6. Template MJML empty or placeholder-only

**Cause:** Row in `email_templates` has null or minimal `mjml`; Handlebars compiles to almost nothing.

**Log evidence (runner):**
- `[MJML] template fetch ok (H6)` with `mjml_len: 0` or very small
- Then `[MJML] compile success (H9)` with small `htmlLen`

**Fix:** Sync or edit the template so `email_templates.mjml` has full MJML body (e.g. from Cultura sync or Phase 5).

---

## H7. Logo/hero image URL broken

**Cause:** Template uses `{{logoUrl}}` / `{{hero_image}}` but URL 404s or is unreachable; preview shows broken image.

**Log evidence (runner):**
- `[MJML] brand + logo (H1/H7)` with `logoUrl: "(none)"` → no logo passed
- `hasLogo: true` but `logoUrlSnippet` is a URL that might be internal/invalid for client
- `[MJML] template payload (H6/H7)` with `hasLogo`, `logoUrlSnippet`

**Fix:** Ensure brand has a logo asset and GET /v1/brand_profiles/:id/assets?asset_type=logo returns a **publicly reachable** URL. If logo is stored with a private or local URL, clients (and preview) will fail to load it.

---

## H8. Handlebars/MJML compile throws → LLM fallback

**Cause:** Compile or mjml2html throws; runner catches and falls through to LLM path, which may produce minimal HTML.

**Log evidence (runner):**
- `[MJML] template compile/render failed (H8)` with `run_id`, `err`, `template_id`
- Next: `[MJML] using LLM path (H8/H9)` with `hasTemplate: true` (we had template but compile failed)

**Fix:** Inspect `err` (e.g. Handlebars missing variable, MJML invalid). Fix template or sectionJson so compile succeeds.

---

## H9. LLM path produces minimal/boilerplate HTML

**Cause:** No template path (no template_id or compile failed); LLM generates short or generic HTML.

**Log evidence (runner):**
- `[MJML] using LLM path (H8/H9)` with `hasTemplate: false` or after (H8)
- `[MJML] compile success (H9)` with small `htmlLen` (if LLM path returns “compile success” — note: LLM path doesn’t log “compile success”; that’s template path only)

**Fix:** Prefer template path: fix H2–H6 and H8 so template is used. If LLM path is required, improve prompt/context so the model outputs full email HTML.

---

## H10. Wrong artifact or run

**Cause:** UI shows a different run’s artifact or cached content.

**Log evidence:**
- Match **run_id** in runner logs to the run shown in the UI (e.g. run `9b2de7f2-4cf6-40f0-bc05-291a35a77631`).
- `[MJML] entry (H10)` and all subsequent logs for that `run_id` should correspond to the artifact you’re viewing (artifact id `7550789b-42ad-4aec-af03-2a8f7c14ac33`).

**Fix:** Confirm artifact’s run_id in DB or API; grep runner logs for that run_id and trace the flow (entry → campaign fetch → template fetch → payload → compile success or LLM path).

---

## Quick checklist (grep runner logs by run_id)

1. **Entry:** `[MJML] entry (H10)` — has `initiative_id`?
2. **Campaign:** `[MJML] campaign fetch (H3/H4)` — has `template_id` and products?
3. **Template:** `[MJML] template fetch ok (H6)` — `mjml_len` > 0?
4. **Payload:** `[MJML] template payload (H6/H7)` — `hasLogo`, `campaignPromptLen` > 0?
5. **Result:** `[MJML] compile success (H9)` (template path) or `[MJML] using LLM path (H8/H9)` (fallback)?
6. **Failure:** Any `[MJML] ... failed (H...)` or `not ok (H5)`?

If runner runs on **Render**, use Render dashboard → Logs and filter/search for your `run_id` and `[MJML]`.
