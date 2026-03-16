# Template QA Loop — Revised Plan (Operationally Durable)

**Engineering Spec: Log Mirror + Template Proofing + Closed-Loop Validation (production spec).**

## 1. Product goal

Turn the system from:

- runner executes somewhere, logs live in Render, validations are sparse, template proofing is manual

into:

- every run has observable evidence inside the console
- validations are populated automatically
- proofing can run at scale across all templates with Sticky Green
- self-heal becomes informed by actual evidence instead of manual pasted logs

**Build a closed-loop template QA and remediation system that:** mirrors Render runner/API logs into the Control Plane; normalizes raw logs into structured observability events; generates validation results for every run; supports large-scale proofing of every email template using a canonical brand fixture (Sticky Green); provides operator workflows (logs, validations, screenshots, proof history, suggested fixes); supports bounded remediation without mutating production templates or brand configs unless explicitly approved.

## 2. Non-goals for v1

- Do **not** auto-write to brand profile / design token records.
- Do **not** auto-write to canonical template source without approval.
- No unrestricted self-healing loops.
- No LLM-first repair before deterministic checks.
- Do **not** rely only on artifact existence as proof of quality (use scorecard).

## 3. Design principles

- **Console = source of truth** for generation, preview, logs, validation results, patch proposals, retry history, human approval.
- **Logs are raw evidence;** the core product object is the **normalized observability event** (interpreted, typed, linked to artifacts and remediation).
- **Stream first, poll second:** Live subscription or syslog stream as primary; bounded backfill poller for missed windows, deploy restarts, and historical recovery. No cron-only polling.
- **Structured emission from runner:** Every meaningful log is JSON (run_id, job_run_id, template_id, brand_profile_id, event_type, code, severity, message, payload, ts). Regex parsing is fallback only for legacy logs.
- **Failure visibility ≠ automatic repair:** Explicit maturity — Layer 1 (visibility) → Layer 2 (suggestion) → Layer 3 (overlay patch) → Layer 4 (approved promotion).
- **Deterministic first, model second.** **Bounded retries only.** **No direct mutation of canonical assets without approval.**

---

## 4. System architecture (high-level modules)

**Render:** Runner service, API service, optional preview/render service.

**Control Plane:** log subscriber, log backfill poller, log normalizer, validation engine, proof batch scheduler, proof worker, screenshot/runtime validator, suggested-fix engine, remediation orchestrator.

**Console:** run detail page (Overview, Flow, Logs, Validations, Screenshots, Autofix, Artifacts), template proofing page, proof batch detail page.

---

## 5. Log ingestion: dual-path (stream + backfill)

**Primary path — live stream**

- Use **Render GET /v1/logs/subscribe** (real-time) or **Render log streaming to a syslog-compatible destination**.
- Durable option: Render → external log stream / subscriber → **normalizer** → Control Plane. That way observability is not lost when Control Plane is unhealthy.
- Output: raw lines → **run_log_entries**; normalizer produces **run_observability_events** (see schema below).

**Secondary path — bounded backfill**

- **render-log-backfill.ts:** Poll **Render GET /v1/logs** with pagination (hasMore / next timestamps) for a time window.
- Use for: missed windows, deploy restarts, outages, historical recovery.
- Same **log-normalizer.ts** consumes backfilled lines and writes run_log_entries + run_observability_events.

**Split modules (not a single cron ingest)**

| Module | Role |
|--------|------|
| **render-log-subscriber.ts** | Attach to Render live stream (or receive from syslog forwarder); write raw lines; invoke normalizer. |
| **render-log-backfill.ts** | Bounded poll over time range using next timestamps; write raw lines; invoke normalizer. |
| **log-normalizer.ts** | Parse raw line: prefer **structured JSON** from runner; fallback regex for run_id/legacy. Enrich with render_service_id, deploy_id, region. Insert run_log_entries; derive and insert run_observability_events (event_type, code, severity, payload, raw_log_entry_id). |

**Why this order**

- Polling every 1–2 minutes creates lag and edge cases; live subscription gives near-real-time visibility.
- Backfill protects from dropped connections and deployment churn.
- Single normalizer keeps parsing and taxonomy in one place.

---

## 6. Schema: logs as evidence, observability events as product

### 6.1 run_log_entries (raw evidence)

| Column | Type | Notes |
|--------|------|------|
| id | uuid pk | |
| run_id | uuid not null | references runs(id); set by normalizer when parsed (or nullable on insert if unknown, then backfill) |
| job_run_id | uuid null | references job_runs(id) |
| source | text not null | e.g. render_runner, render_api |
| level | text null | |
| message | text not null | |
| logged_at | timestamptz not null | |
| render_service_id | text null | |
| render_service_name | text null | |
| render_deploy_id | text null | |
| ingest_batch_id | uuid null | for backfill batches |
| dedupe_hash | text not null | for dedupe (see 6.4) |
| created_at | timestamptz not null | default now() |

**Indexes:** (run_id, logged_at desc), (job_run_id, logged_at desc), unique dedupe on (run_id, source, logged_at, dedupe_hash). For canonical DDL (including `on delete cascade` / `on delete set null`), see **§18.1**.

### 6.2 run_observability_events (core debugging object)

| Column | Type | Notes |
|--------|------|------|
| id | uuid pk | |
| run_id | uuid not null | references runs(id) |
| job_run_id | uuid null | references job_runs(id) |
| raw_log_entry_id | uuid null | references run_log_entries(id) |
| source | text not null | render_runner, render_api, browser_runtime, validator_engine |
| event_type | text not null | asset_check, content_check, render_check, visual_check |
| code | text not null | e.g. ASSET.LOGO_MISSING |
| severity | text not null | |
| message | text not null | |
| payload_json | jsonb not null | default '{}' |
| logged_at | timestamptz not null | |
| created_at | timestamptz not null | default now() |

**Indexes:** (run_id, logged_at desc), (run_id, code), (run_id, severity).

### 6.3 Runner logging contract (structured JSON)

Every meaningful runner log must be **one line**, single JSON object:

**Required fields:**

```json
{
  "run_id": "uuid",
  "job_run_id": "uuid",
  "template_id": "uuid",
  "brand_profile_id": "uuid",
  "event_type": "asset_check",
  "code": "ASSET.LOGO_MISSING",
  "severity": "error",
  "message": "Logo URL missing for brand profile",
  "payload": {
    "brand_name": "Sticky Green",
    "logo_url": null
  },
  "ts": "2026-03-06T16:00:00Z"
}
```

- Normalizer: detect JSON, extract fields, map code to taxonomy, insert run_log_entries (with dedupe_hash) and run_observability_events (raw_log_entry_id).

**Legacy fallback parsing (regex):** run_id, job_run_id, template_id, brand_profile_id, known error phrases.

### 6.4 Dedupe strategy

Dedupe key for run_log_entries:

- run_id
- source
- timestamp rounded to second
- hash of normalized message (e.g. first 1k chars or full message)

Use unique index or upsert to avoid duplicate rows on re-ingest.

---

## 7. Validation taxonomy (standardized from day one)

Store for each event/validation: **class**, **code**, **severity**, **fixability**, **owner_type** (brand | template | system). Optional table **validation_taxonomy**: code (pk), class, severity, fixability, owner_type, description, default_title.

**Full taxonomy:**

**Asset:** ASSET.LOGO_MISSING, ASSET.LOGO_URL_NULL, ASSET.LOGO_404, ASSET.IMAGE_URL_NULL, ASSET.IMAGE_404, ASSET.FONT_UNAVAILABLE.

**Content:** CONTENT.CAMPAIGN_COPY_MISSING, CONTENT.HEADLINE_UNBOUND, CONTENT.PLACEHOLDER_MISMATCH, CONTENT.PRODUCT_GRID_EMPTY, CONTENT.MISSING_LEGAL_COPY.

**Structure:** STRUCTURE.EMPTY_HERO, STRUCTURE.MISSING_CTA, STRUCTURE.MISSING_FOOTER, STRUCTURE.REQUIRED_SECTION_ABSENT.

**Render:** RENDER.NO_ARTIFACTS, RENDER.MJML_COMPILE_ERROR, RENDER.HTML_EMPTY, RENDER.TIMEOUT, RENDER.PREWRITE_FAILED.

**Runtime:** RUNTIME.BROWSER_CONSOLE_ERROR, RUNTIME.NETWORK_FAILURE, RUNTIME.ASSET_BLOCKED, RUNTIME.JS_EXCEPTION.

**Visual:** VISUAL.CLIPPING, VISUAL.OVERFLOW_DESKTOP, VISUAL.OVERFLOW_MOBILE, VISUAL.INVISIBLE_TEXT, VISUAL.LARGE_EMPTY_GAP, VISUAL.LAYOUT_COLLAPSE.

**Validation row policy:** For every critical failure, create a row in **validations** (existing table). Use **namespaced validator_type**: e.g. `deterministic:artifact_presence`, `deterministic:required_footer`, `runtime:logo_missing`, `runtime:campaign_copy_missing`, `visual:overflow_mobile`.

---

## 8. Three validator classes (Phase 2)

**A. Deterministic validators (not log-based)**

Run regardless of what the runner logged:

- artifact_count > 0
- HTML artifact exists and has expected structure
- MJML compile succeeded (from artifact metadata or separate check)
- logo URL resolved (non-empty, from sectionJson or artifact metadata)
- image URLs resolved (e.g. product images)
- required blocks present (hero, CTA, footer)
- CTA href present and not placeholder
- footer/legal present
- no empty hero (content length / placeholder check)

**B. Runtime validators (from logs + browser/network)**

- logo_missing, campaign_copy_missing, template_placeholder_mismatch (from run_observability_events)
- failed network requests (from browser capture)
- browser console errors
- timeout / render crash

**C. Visual validators (from screenshots / DOM)**

- clipping, overflow, giant whitespace gap
- mobile stacking broken
- text invisible on background
- missing hero image despite valid asset URL (e.g. 404 in browser)

**Current plan had mostly B.** Bulletproofing requires **A + B + C**. Implementation: run A on every completed run (artifact + metadata); B from observability_events + optional browser evidence; C from proof-run screenshot/DOM pipeline (Phase 3).

---

## 9. Proof runs: evidence and scorecard (not artifact count alone)

**Per proof run, capture:**

- rendered HTML (existing artifact)
- **desktop screenshot**
- **mobile screenshot**
- **network failures** (URL, status)
- **browser console** (errors, warnings)
- **DOM snapshot or simplified section tree** (optional but useful)

**Pass/fail scorecard (replaces “artifact count > 0”):**

- compile pass
- artifact exists
- no critical asset failures
- no critical validations (from A + B + C)
- screenshot captured (desktop + mobile)
- no obvious clipping/overflow (visual validators)
- required sections present

A run can “succeed” and still produce garbage; the scorecard is what makes proofing scalable and auditable.

---

## 10. Proof batching: queue and stop rules

**Do not implement only a synchronous “loop templates for 30 minutes” script.**

**Batch state machine:** queued → running → paused | completed | failed | cancelled. **Per-template proof run states:** queued, running, succeeded, failed, timed_out, skipped.

**Tables (full schema from spec):**

- **template_proof_batches:** id (uuid pk), brand_profile_id (not null), status (queued | running | paused | completed | failed | cancelled), started_at, end_at, paused_at, completed_at, criteria_json, scope_json, notes, created_by, created_at, updated_at.
- **template_proof_runs:** id (uuid pk), batch_id (FK), template_id, brand_profile_id, run_id, attempt_number (default 1), status (queued | running | succeeded | failed | timed_out | skipped), artifact_count, score, validation_summary_json, log_summary_json, screenshot_artifact_id, mobile_screenshot_artifact_id, dom_snapshot_artifact_id, notes, started_at, completed_at, created_at. Indexes: (batch_id, template_id, attempt_number desc), (template_id, created_at desc), (run_id).

**Flow**

- Create a batch (e.g. Sticky Green, end_at = now + 30 min).
- **Enqueue one proof task per template** (e.g. template_proof_tasks or rows in template_proof_runs with status = queued).
- **Workers pick tasks** until end_at or paused_at or pause flag.
- Batch aggregates latest results; UI shows pass/fail per template and batch-level stats.

**Proof run execution flow (per template):** Create campaign using Sticky Green brand_profile_id + template_id + proof-run prompt; create initiative/plan if required; start run in sandbox; poll run status; ingest logs during run; collect artifacts; run deterministic then runtime then visual validators; compute score; mark pass/fail; create suggested fixes if failed.

This makes pause/resume sane and auditable.

---

## 11. Three fix layers (product decision)

**Layer 1 — Visibility only**

- Surface problem and exact location (run, template, brand, code, severity).
- No suggested fix yet.

**Layer 2 — Suggestion**

- Generate a recommended fix, e.g.:
  - “Set Sticky Green logo URL”
  - “Hero block missing [headline] token”
  - “CTA button href not bound to campaign object”
- **Suggested owner** (brand / template / system) and **one-click navigation** to the broken brand/template setting in Console.

**Layer 3 — Overlay patch (optional future)**

- Temporary runtime fix, not canonical mutation (e.g. substitute fallback logo during test run, inject safe headline fallback during proof run).

**Layer 4 — Approved promotion**

- Human reviews and promotes change to: brand config, template source, or system settings. No auto-apply in v1.

**Suggested fix shape (v1):** Store in **suggested_fixes** table: run_id, template_proof_run_id, scope_type (brand_profile | email_template | system_config), scope_id, owner_type (brand | template | system), failure_code, title, description, fix_payload_json, status (open | accepted | dismissed | applied), created_at, updated_at. Example fix_payload_json: `{ "target_page": "/brands/:id/assets", "field": "logo_url" }`.

---

## 12. Run detail tabs and Console UX

**Run detail page tabs:** Overview (run metadata, status, template, brand, score, pass/fail), Flow (job graph, timing), **Logs** (raw mirrored logs, source filter, search, refresh logs button), **Validations** (grouped by severity and validator class, link to evidence), **Screenshots** (desktop, mobile, compare attempts if available), **Autofix** (suggested fixes, owner routing, failure summary), **Artifacts** (HTML, compile report, DOM snapshot, validation summary).

**Template proofing page:** Top controls — brand selector, Start proof run, Pause, Resume, criteria display, batch timer/status. Main table columns: Template name, Last proof status, Score, Last run at, Artifact count, Critical validations count, Suggested fixes count, Open run, Open proof detail. Filters: pass / fail / needs review, has critical failure, owner type, template category.

**Proof batch detail page:** Totals (pass / fail / review), templates attempted, remaining templates, highest-frequency failure codes, links to worst runs, operator notes.

---

## 13. Data model (revised summary)

**Existing:** runs, job_runs, job_events, artifacts, validations, email_templates, brand_profiles, initiatives, email_design_generator_metadata.

**New or revised**

| Table | Purpose |
|-------|---------|
| run_log_entries | Raw log lines; render_service_id, render_service_name, render_deploy_id, render_region, owner_or_workspace_id; run_id/job_run_id when parsed. |
| run_observability_events | Interpreted events; event_type, severity, code, message, payload_json, raw_log_entry_id. Core object for debugging and validators. |
| validation_results | Per-run, per-validator: run_id, job_run_id, validator_class (A|B|C), code, passed, score, evidence_json, created_at. |
| validation_artifacts | Links validation_results to artifacts (screenshot, DOM snapshot). |
| template_proof_batches | batch_id, brand_profile_id, started_at, end_at, paused_at, status, criteria_json. |
| template_proof_runs | batch_id, template_id, brand_profile_id, run_id, attempt_number, status (queued\|running\|succeeded\|failed\|timed_out\|skipped), validation_summary_json, log_summary_json, screenshot_artifact_id, mobile_screenshot_artifact_id, dom_snapshot_artifact_id, score, started_at, completed_at. |
| suggested_fixes | run_id, template_proof_run_id, scope_type, scope_id, owner_type, failure_code, title, description, fix_payload_json, status (open\|accepted\|dismissed\|applied). |
| patch_attempts | run_id, template_id, attempt_number, diagnosis, patch_type, patch_diff, applied, outcome; suggested_owner. |
| golden_baselines | template_id, brand_id, artifact_id, screenshot_artifact_id, approved_at, token_map_snapshot, section_map_snapshot. |
| brand_fixture_packs | Sticky Green (and later others): canonical_logo_url, fallback_logo_urls, required_tokens, sample_products, footer_required. |

**Failure taxonomy table (optional):** validation_taxonomy: code (pk), class, severity, fixability, owner_type, description, default_title.

---

### 13.1 API spec (from Engineering Spec)

**Run logs:** GET /v1/runs/:id/log_entries — query: limit, offset, source, order=asc|desc. Response: items (id, run_id, job_run_id, source, level, message, logged_at), limit, offset, total. POST /v1/runs/:id/ingest_logs — trigger bounded backfill for that run; response: ok, ingested.

**Observability:** GET /v1/runs/:id/observability_events — query: severity, event_type, code, limit, offset.

**Template proofing:** POST /v1/template_proof/start — body: brand_profile_id, duration_minutes, template_ids, criteria (require_artifact, require_screenshots, fail_on_critical_validation, min_score). Returns batch_id, status. POST /v1/template_proof/:batchId/pause, POST /v1/template_proof/:batchId/resume. GET /v1/template_proof — query: brand_profile_id, batch_id, status, template_id. GET /v1/template_proof/:batchId — batch detail + summary stats.

**Suggested fixes:** GET /v1/runs/:id/suggested_fixes, GET /v1/template_proof_runs/:id/suggested_fixes. POST .../apply not in v1 unless tightly scoped.

---

### 13.2 Background job spec

**render-log-subscriber:** Runs continuously; connect to Render log stream; normalize; insert run_log_entries; emit observability events. Restart: recover from disconnect; persist last cursor if available.

**render-log-backfill:** Every 60–120 s; fetch logs for recent window; service-specific cursors/timestamps; dedupe inserts; fill missed gaps; re-run normalization on newly inserted logs.

**template-proof-dispatcher:** Create proof tasks from batch scope; respect batch pause/end_at; maintain queue state.

**template-proof-worker:** Execute one template proof task: start run, poll run, collect artifacts, validate, score, store results, generate suggestions.

---

### 13.3 Stop conditions and retry policy

**Per-template run timeout:** 3 minutes default, configurable (PROOF_DEFAULT_TIMEOUT_SECONDS).

**Batch stop:** current time > end_at; batch paused; batch cancelled; all templates processed.

**v1 retry:** 1 automatic rerun only for **infra-class** failures. No infinite reruns; no automatic retries for brand/template semantic failures. **Retry-safe:** temporary network timeout, no artifacts due to worker transient, screenshot capture service hiccup. **Retry-unsafe:** missing logo URL, template placeholder mismatch, missing campaign copy binding.

---

### 13.4 Sticky Green harness spec

Sticky Green = canonical proof brand fixture. **Required fixture data:** canonical logo URL, fallback logo URL, brand colors, typography tokens, CTA tone rules, legal/footer copy, sitemap/source URLs if required by campaign gen, safe sample product/category content, approved hero copy fallback. Kept intentionally complete and stable so proof failures reflect template/system issues, not random missing brand data.

---

### 13.5 Operator workflow

**Debugging a single run:** Open run → Logs → Validations → screenshots → suggested fixes → apply manual fix in brand/template editor → rerun.

**Proving all templates:** Open Template Proofing → choose Sticky Green → start 30-minute batch → let system process → pause or wait for end → sort failures by frequency/code → review screenshots/logs/validations → fix highest-leverage issues → resume or start new batch.

---

### 13.6 Security and config

**Server-side config:** RENDER_API_KEY, ENABLE_RENDER_LOG_INGEST=true|false, RENDER_RUNNER_SERVICE_NAME, optional RENDER_API_SERVICE_NAME, PROOF_DEFAULT_DURATION_MINUTES, PROOF_DEFAULT_TIMEOUT_SECONDS, PROOF_ENABLE_SCREENSHOTS=true|false.

**Security rules:** No Render credentials in browser; all log fetches Console → Control Plane → Render; suggested fixes do not auto-apply unless explicitly allowed.

---

### 13.7 Ticket breakdown (first concrete tickets)

1. Add run_log_entries and run_observability_events migrations.
2. Implement render-log-backfill with dedupe and run_id parsing.
3. Add GET /v1/runs/:id/log_entries and Run Detail Logs tab.
4. Add deterministic validators: artifact presence, HTML existence, footer existence, CTA existence, logo token presence.
5. Add runtime/log validators: logo missing, campaign copy missing, placeholder mismatch, prewrite failed, no artifacts.
6. Add screenshot capture + screenshot artifact support.
7. Add template_proof_batches and template_proof_runs (migrations + model).
8. Build POST /v1/template_proof/start, pause, resume, list.
9. Build Template Proofing page and batch detail page.
10. Build suggested_fixes generation and Autofix tab.

**Recommendation:** Do not start with "AI healer writes fixes." Start with logs mirrored, events normalized, validations classified, screenshots captured, proof batches scored, suggestions routed. Then the self-heal loop can become trustworthy.

---

## 14. Revised implementation order

### Phase 1 — Structured runner logging + stream + backfill + Logs tab

- **Runner:** Emit **structured JSON** for every meaningful event in email_generate_mjml (asset_check, compile_result, pre_write_check, etc.) with run_id, job_run_id, event_type, code, severity, template_id, brand_profile_id, message. Keep console.log for backward compatibility but ensure one structured line per event.
- **Control Plane:**
  - **render-log-subscriber.ts** — subscribe to Render GET /v1/logs/subscribe (or receive from syslog forwarder); persist raw lines with render_service_id, deploy_id, region, owner; call log-normalizer.
  - **render-log-backfill.ts** — bounded poll GET /v1/logs with pagination (next timestamps) for missed windows; same normalizer.
  - **log-normalizer.ts** — parse JSON first; fallback regex for run_id; insert run_log_entries; derive run_observability_events (code from taxonomy); link raw_log_entry_id.
- **Schema:** run_log_entries (with Render identity columns), run_observability_events.
- **API:** GET /v1/runs/:id/log_entries, GET /v1/runs/:id/observability_events.
- **Console:** **Logs** tab on run detail (raw + optional events view).

**Deliverables:** Live stream + backfill in place; runner emitting JSON; Logs tab populated; no cron-only dependency.

---

### Phase 2 — Deterministic + log-derived validators + taxonomy + Validations tab

- **Deterministic validators (A):** Implement checks that run after every email run: artifact count, HTML structure, logo resolved, image URLs, required blocks, CTA href, footer, empty hero. Write to **validation_results** (validator_class = deterministic).
- **Runtime validators (B):** From run_observability_events (and optional browser evidence): map code to validation_results (validator_class = runtime).
- **Taxonomy:** Define ASSET.*, CONTENT.*, STRUCTURE.*, RENDER.*, VISUAL.*; store in validation_taxonomy; use in normalizer and UI (suggested_owner, fixability).
- **Validations tab:** Populated for normal runs; grouped by validator class; show code, severity, evidence, link to artifact/screenshot.

**Deliverables:** A + B validators; validation_results and (optionally) validation_artifacts; Validations tab is the ops view for failures.

---

### Phase 3 — Proof batches + Sticky Green harness + screenshots + scorecard

- **template_proof_batches** and **template_proof_runs**; enqueue one task per template; workers pick until end_at or pause.
- **Sticky Green fixture pack:** canonical logo, fallback URLs, required tokens, sample products; used as default brand for proof batches.
- **Proof run evidence:** For each proof run, capture rendered HTML, **desktop screenshot**, **mobile screenshot**, network failures, browser console, optional DOM snapshot. Store as artifacts; link in validation_artifacts / validation_summary_json.
- **Scorecard:** Pass/fail from compile pass, artifact exists, no critical asset/validation failures, screenshots captured, no clipping/overflow, required sections. Store score and validation_summary_json on template_proof_runs.
- **Console:** Proof history tab; Template QA / Proofing page with batch list, batch detail (template × result, score, link to run), Screenshots tab per run.

**Deliverables:** Queue-based proofing; Sticky Green harness; screenshot capture; scorecard-driven pass/fail; Screenshots tab.

---

### Phase 4 — Suggested fixes + owner routing + one-click navigation

- **Layer 2 (suggestion):** For each code in validation_results, generate a recommended fix message and **suggested_owner** (brand | template | system).
- **Console:** In Validations and Autofix, show “Set Sticky Green logo URL” (or similar) with **one-click link** to the brand edit page (or template edit) so the user can fix the right place.
- **Autofix tab:** Diagnosis summary, suggested fix text, link to brand/template; no apply yet.

**Deliverables:** Suggested fix text and suggested_owner; one-click navigation to broken brand/template setting.

---

### Phase 5 — Apply with approval (safe classes only)

- **Layer 3:** For **safe** taxonomy classes (e.g. ASSET.LOGO_MISSING with fixture fallback), allow “Apply” that writes to run-time overlay or, with approval, to brand_profiles (e.g. design_tokens).
- **Guardrails:** Do not auto-apply to template source; require explicit approval for brand/template writes.
- **patch_attempts:** Record applied patch, outcome, and whether it was overlay vs promoted to brand/template.

**Deliverables:** Apply button for safe fixes; promotion path with approval; patch_attempts auditable.

---

## 15. Visual validators (C) and when they run

- **Visual validators** (clipping, overflow, mobile, invisible text) require screenshot and/or DOM. Implement in Phase 3 alongside proof-run capture: after rendering, run Playwright (or equivalent), capture desktop + mobile screenshot and optional DOM/section tree; run checks; write to validation_results (validator_class = visual).
- For **normal** (non-proof) runs, visual validators can be optional or skipped until a “Request proof” action runs a lightweight capture.

---

## 16. File and component ownership (revised)

| Component | Owner | Notes |
|-----------|--------|------|
| run_log_entries, run_observability_events | control-plane migration + api.ts | GET log_entries, GET observability_events; Render identity columns on run_log_entries |
| render-log-subscriber.ts | control-plane | Live stream (GET /v1/logs/subscribe or syslog); write raw, call normalizer |
| render-log-backfill.ts | control-plane | Bounded poll GET /v1/logs with next timestamps; call normalizer |
| log-normalizer.ts | control-plane | JSON-first parse; regex fallback; insert run_log_entries + run_observability_events |
| email_generate_mjml.ts | runners | Emit one JSON line per meaningful event (run_id, job_run_id, event_type, code, severity, template_id, brand_profile_id, message) |
| validation_results, validation_artifacts | control-plane migration + api.ts | Validators write here; GET by run_id, template_id, batch_id |
| validation_taxonomy | control-plane migration + seed | class, code, severity, fixability, suggested_owner |
| Deterministic validators (A) | control-plane or runner | Post-run checks: artifact, HTML, logo, CTA, footer, etc. |
| Proof batch worker | control-plane | Dequeue template_proof_runs; run proof; capture screenshots; scorecard; update template_proof_runs |
| Template Lab / Proofing UI | console | Overview, batch list, batch detail, Run detail (Logs, Validations, Screenshots, Autofix, Proof history) |
| Brand fixture pack | brand_profiles or new table + seed | Sticky Green canonical + fallback URLs, required tokens |

---

## 17. Success criteria (revised)

1. **No manual log paste:** Logs and observability events are in Console via **stream + backfill**; Logs tab shows raw lines and interpreted events.
2. **“Logo is not loading”** is closed-loop: which run, which template, which brand; whether URL was null, 404, blocked, or never bound; whether screenshot confirms absence; what fix is suggested; whether next rerun passed. All visible in Console (Validations + Screenshots + Autofix).
3. **Proofing is queue-based and scorecard-driven:** Batches with end_at and pause; workers dequeue; pass/fail from scorecard (compile, artifact, no critical failures, screenshots, no clipping, required sections), not artifact count alone.
4. **Three fix layers:** Visibility → Suggestion (with one-click to brand/template) → Apply with approval for safe classes only.
5. **Taxonomy and suggested_owner** make the console an ops tool: every failure has a class, code, and place to fix (brand, template, system).

**Run-level:** Opening any run shows logs without manual paste; validations populated for normal runs; screenshots attached for proofed templates; failure causes classified. **Batch-level:** Launch 30-minute Sticky Green proof batch from console; each template has latest status and score; pause/resume cleanly; repeated issues cluster. **Operator-level:** "Logo is not loading" → system shows which run/template/brand failed, what screenshots show, what validation code fired, what fix is suggested, whether rerun passed.

This revamp makes the system **operationally durable**: stream-first ingest, observability events as the core object, structured runner emission, three validator classes (A + B + C), proof batches with queues and scorecards, and a clear visibility → suggestion → apply maturity curve.

---

## 18. Build-ready package (implementation artifacts)

Implementation-oriented layer so the team can wire immediately: Postgres schema SQL, endpoint contracts, worker/job contracts, console page map, event taxonomy seeds, rollout order.

### 18.1 Postgres schema SQL (canonical)

**run_log_entries:** `id uuid pk default gen_random_uuid()`, `run_id uuid not null references runs(id) on delete cascade`, `job_run_id uuid null references job_runs(id) on delete set null`, `source text not null`, `level text null`, `message text not null`, `logged_at timestamptz not null`, `render_service_id`, `render_service_name`, `render_deploy_id`, `ingest_batch_id`, `dedupe_hash text not null`, `created_at`. Indexes: `(run_id, logged_at desc)`, `(job_run_id, logged_at desc)`, **unique** `(run_id, source, logged_at, dedupe_hash)`.

**run_observability_events:** `id`, `run_id`, `job_run_id`, `raw_log_entry_id references run_log_entries(id) on delete set null`, `source`, `event_type`, `code`, `severity`, `message`, `payload_json jsonb not null default '{}'`, `logged_at`, `created_at`. Indexes: `(run_id, logged_at desc)`, `(run_id, code)`, `(run_id, severity)`.

**template_proof_batches:** `status text check (status in ('queued','running','paused','completed','failed','cancelled'))`, `criteria_json`, `scope_json`, `completed_at`, `updated_at`. Indexes: `(brand_profile_id, created_at desc)`, `(status)`.

**template_proof_runs:** `status check (status in ('queued','running','succeeded','failed','timed_out','skipped'))`, `artifact_count int default 0`, `score numeric(5,2)`, `validation_summary_json`, `log_summary_json`, `screenshot_artifact_id`, `mobile_screenshot_artifact_id`, `dom_snapshot_artifact_id references artifacts(id) on delete set null`. Indexes: `(batch_id, template_id, attempt_number desc)`, `(template_id, created_at desc)`, `(run_id)`, `(status)`.

**suggested_fixes:** `status check (status in ('open','accepted','dismissed','applied')) default 'open'`. Indexes: `(run_id, created_at desc)`, `(template_proof_run_id, created_at desc)`, `(failure_code)`, `(status)`.

**validation_taxonomy (optional):** `code text primary key`, `class`, `severity`, `fixability` (none | suggestion | overlay | approved_apply), `owner_type`, `default_title`, `description`.

### 18.2 Taxonomy seed rows

Seed at least: ASSET.LOGO_MISSING, ASSET.LOGO_URL_NULL, ASSET.LOGO_404; CONTENT.CAMPAIGN_COPY_MISSING, CONTENT.PLACEHOLDER_MISMATCH; STRUCTURE.EMPTY_HERO, STRUCTURE.MISSING_CTA, STRUCTURE.MISSING_FOOTER; RENDER.NO_ARTIFACTS, RENDER.MJML_COMPILE_ERROR, RENDER.HTML_EMPTY, RENDER.TIMEOUT; RUNTIME.NETWORK_FAILURE; VISUAL.OVERFLOW_MOBILE, VISUAL.CLIPPING. Each row: code, class, severity, fixability, owner_type, default_title, description.

### 18.3 Validation rules mapping (raw message pattern map)

Parser/validator uses a **LOG_PATTERN_RULES**-style map: for each known code, define `code`, `severity`, `eventType`, and `matches` (array of regexes). Example: ASSET.LOGO_MISSING → matches like `/hasLogo:\s*false/i`, `/logo missing/i`, `/logoUrl:\s*['"]?\(none\)['"]?/i`; CONTENT.CAMPAIGN_COPY_MISSING → `/campaign copy.*not found/i`; RENDER.NO_ARTIFACTS → `/no artifacts/i`, `/artifact_count:\s*0/i`; RENDER.MJML_COMPILE_ERROR → `/mjml compile error/i`; RENDER.TIMEOUT → `/timed out/i`. Use this for legacy (non-JSON) log line classification.

### 18.4 Endpoint contract details

**GET /v1/runs/:id/log_entries:** Query: limit, offset, source, order. Response: `items[]` (id, run_id, job_run_id, source, level, message, logged_at, render_service_id, render_service_name), `limit`, `offset`, `total`.

**POST /v1/runs/:id/ingest_logs:** Request body optional: `{ "force_window_minutes": 30 }`. Response: `ok`, `run_id`, `ingested`, `events_created`, `validations_created`.

**GET /v1/runs/:id/observability_events:** Response: `items[]` (id, run_id, job_run_id, source, event_type, code, severity, message, payload_json, logged_at), `limit`, `offset`, `total`.

**GET /v1/runs/:id/suggested_fixes:** Response: `items[]` (id, run_id, scope_type, scope_id, owner_type, failure_code, title, description, fix_payload_json e.g. target_path/target_page, field, status).

**POST /v1/template_proof/start:** Body: `brand_profile_id`, `duration_minutes`, `template_ids` (optional), `criteria` (require_artifact, require_screenshots, fail_on_critical_validation, min_score), **scope** (e.g. `{ "mode": "all_templates" }` or selected). Response: `batch_id`, `status: "queued"`.

**POST /v1/template_proof/:batchId/pause | resume:** Response: `ok`, `batch_id`, `status`.

**GET /v1/template_proof:** Query: brand_profile_id, batch_id, status, template_id. Response: `items[]` with template_id, template_name, latest_proof_run_id, latest_batch_id, latest_status, score, artifact_count, critical_failures, warnings, last_run_at, run_id.

**GET /v1/template_proof/:batchId:** Response: `batch` (id, brand_profile_id, status, started_at, end_at, criteria_json), `summary` (total_templates, attempted, passed, failed, needs_review, remaining, top_failure_codes[] { code, count }), `items[]`.

### 18.5 Internal service contracts (TypeScript)

**NormalizedRunLog:** runId (string | null), jobRunId, templateId, brandProfileId; source (render_runner | render_api | browser_runtime | validator_engine); level; message; loggedAt; renderServiceId, renderServiceName, renderDeployId; raw.

**ObservabilityEvent:** runId, jobRunId, rawLogEntryId; source; eventType (asset_check | content_check | render_check | runtime_check | visual_check); code; severity (info | warn | error); message; payload; loggedAt.

**TemplateProofTask:** batchId, templateId, brandProfileId, attemptNumber, criteria (requireArtifact, requireScreenshots, failOnCriticalValidation, minScore), timeoutSeconds.

### 18.6 Suggested file structure

**Control Plane:** `src/api/` (runs.ts, template-proof.ts, suggested-fixes.ts); `src/jobs/` (render-log-subscriber.ts, render-log-backfill.ts, template-proof-dispatcher.ts, template-proof-worker.ts); `src/services/` (log-normalizer.ts, log-parser.ts, validation-engine.ts, deterministic-validators.ts, runtime-validators.ts, visual-validators.ts, scoring-engine.ts, suggested-fix-engine.ts, template-proof-service.ts); `src/db/queries/` (run-log-entries.ts, observability-events.ts, template-proof-batches.ts, template-proof-runs.ts, suggested-fixes.ts); `src/lib/` (validation-taxonomy.ts, log-pattern-rules.ts, proof-criteria.ts).

**Console:** `app/runs/[id]/` (page.tsx, components: run-logs-tab.tsx, run-validations-tab.tsx, run-screenshots-tab.tsx, run-autofix-tab.tsx); `app/template-proofing/` (page.tsx, [batchId]/page.tsx, components: proof-table.tsx, proof-batch-header.tsx, proof-summary-cards.tsx, proof-filters.tsx).

### 18.7 Console page map (granular)

**Run detail:** Tabs Overview, Flow, Logs, Validations, Screenshots, Artifacts, Autofix. **Logs tab:** fetch GET log_entries?limit=200; optional button POST ingest_logs; filter by source, level; search text. **Validations tab:** group by critical / warnings / passed; each row links to relevant log entry, screenshot, suggested fix. **Screenshots tab:** desktop and mobile screenshot artifacts; optional compare-attempts dropdown. **Autofix tab:** list suggested_fixes; owner badge (brand / template / system); show action link target.

**Template proofing main:** Header: brand selector, start batch, pause current batch, resume. Summary cards: total templates, passed, failed, needs review, remaining. Table columns: Template, Latest status, Score, Critical failures, Warnings, Last proof date, Open run, Open batch detail. Filters: failed only, has critical issues, owner type, template category.

**Proof batch detail:** Batch metadata; progress bar; **failure leaderboard** (top 10 failure codes by count — for leverage fixes); templates list; operator notes.

### 18.8 Scoring engine logic

**scoreProofRun(input):** hardFailCodes Set (RENDER.NO_ARTIFACTS, RENDER.MJML_COMPILE_ERROR, RENDER.HTML_EMPTY, ASSET.LOGO_MISSING, STRUCTURE.EMPTY_HERO, STRUCTURE.MISSING_FOOTER). If any criticalCode in hardFailCodes → return { score: 0, status: "fail" }. Start score 100; artifactCount &lt; 1 → -50; no desktop screenshot → -25; no mobile screenshot → -25; warning codes (e.g. VISUAL.OVERFLOW_MOBILE -20, VISUAL.CLIPPING -15, CONTENT.PLACEHOLDER_MISMATCH -10). Return pass if score >= 90, needs_review if >= 75, else fail.

### 18.9 Deterministic validator contract

**Input (DeterministicValidationInput):** runId, templateId, brandProfileId, artifacts[], html, sectionTree, tokenMap. **Output (ValidationResult):** validatorType, status (pass | fail), code, severity, message, report. Example checks: no artifacts, missing html, missing footer, CTA absent, logo token absent.

### 18.10 Suggested-fix generation rules

**buildSuggestedFixes(codes, ctx):** For ASSET.LOGO_MISSING / ASSET.LOGO_URL_NULL → scopeType brand_profile, ownerType brand, title "Set canonical logo URL", fixPayloadJson { targetPage: `/brands/${brandProfileId}/assets`, field: "logo_url" }. For CONTENT.PLACEHOLDER_MISMATCH → scopeType email_template, ownerType template, targetPage `/email-templates/${templateId}`. Return array of { scopeType, scopeId, ownerType, failureCode, title, description, fixPayloadJson }.

### 18.11 Proof batch execution pseudo-code

**startTemplateProofBatch:** Create batch (status queued, endAt = now + durationMinutes, criteriaJson, scopeJson { mode: "all_templates" | "selected_templates", templateIds }). Load templates (by ids or all). For each template, enqueue "template-proof-task" with batchId, templateId, brandProfileId, attemptNumber 1, criteria, timeoutSeconds 180. Update batch status to running. Return batch.

### 18.12 Minimum viable rollout (V1A–V1D)

**V1A:** run_log_entries, log backfill poller, Logs tab.  
**V1B:** log pattern parser, log-derived validations, Validations tab populated.  
**V1C:** template_proof_batches, template_proof_runs, start/pause/list proof batch, proofing page with latest pass/fail per template.  
**V1D:** desktop/mobile screenshots, score model, suggested fixes.

This sequence delivers most operational value quickly.

### 18.13 Engineering team rules (explicit)

- Every new runner log must include run_id and job_run_id.
- Prefer structured JSON logs over plain text.
- Do not let proof pass solely on status=succeeded; use scorecard.
- Do not auto-edit brand/template source in v1.
- Every critical failure must produce either a validation row or an observability event.
- Every proof run should aim to store desktop + mobile screenshots.
- Batch proofing must be pauseable and resumable.
- Suggested fixes must identify owner: brand, template, or system.

### 18.14 Alternative first 7 tickets

1. Add migrations for run_log_entries, run_observability_events, template_proof_batches, template_proof_runs, suggested_fixes.  
2. Build log backfill ingestion from Render into run_log_entries.  
3. Add run Logs tab in the Console.  
4. Add log normalization + event generation + validation creation.  
5. Build POST /v1/template_proof/start and GET /v1/template_proof.  
6. Build Template Proofing page with latest result per template.  
7. Add screenshot capture and proof scoring.

### 18.15 Shortest product summary

You are building a **Template QA operating system**. It should answer, in one place: **what happened**, **why it failed**, **what evidence proves it**, **who owns the fix**, and **whether the rerun passed**. That is the right abstraction.

---

## 19. Reference architectures and event model alignment

### 19.1 What we already use (in this repo)

- **run_events** (schemas/001_core_schema.sql): Append-only lifecycle ledger per run (`run_event_type`: queued, started, stage_entered, stage_exited, succeeded, failed, rolled_back). Used by Control Plane (e.g. reaper) and blueprint; **Intent → Plan → Job → Runner** state is recorded here.
- **job_events**: Append-only per job_run (attempt_started, attempt_succeeded, attempt_failed, hypothesis_generated, patch_applied, etc.).
- **OpenTelemetry**: Control Plane already has `@opentelemetry/*` in the dependency tree (e.g. instrumentation-express, api, core). Our log ingest pipeline (Render → backfill/subscriber → normalizer → DB) is analogous to **OTel Collector**: Source (Render) → Collector (our ingest) → Processor (log-normalizer) → Exporter (run_log_entries + run_observability_events). Align naming and structure with OTel where it helps (e.g. severity, resource attributes).
- **Langfuse**: Documented for LiteLLM gateway (gateway/README, docs); optional for LLM trace callbacks. Not used for template proofing; Langfuse’s trace → spans → events pattern is a good mental model for run → job_run → tool_calls → log_entries.
- **Playwright**: Plan already specifies “Playwright (or equivalent)” for visual validators and screenshot capture; console uses `@vitest/browser-playwright` for e2e. Playwright CI (render → screenshot → compare baseline → fail if mismatch) is the target pattern for future email proofing.
- **Temporal / Dagster**: Not used today. [docs/REFERENCE_REPOS_DISCUSSED.md](docs/REFERENCE_REPOS_DISCUSSED.md): “Postgres + scheduler; optional upgrade to Temporal later”; “custom plan DAG in control-plane.” [AI_Factory_Architecture_Blueprint.md](AI_Factory_Architecture_Blueprint.md) documents both DB-first and Temporal-first variants; run_id ↔ workflow ID, job_run_id ↔ activity.

### 19.2 Mapping external projects to this plan

| Project | Parallel to our system | What to steal / reuse |
|--------|------------------------|------------------------|
| **Temporal** | Workflow → Activity → Worker → Logs → Visibility DB → UI ≈ Intent → Plan → Job → Runner → Logs → Control Plane DB → Console | Event history store, workflow replay, run inspection UI patterns. We keep Postgres as ledger; Temporal is optional for scheduling. |
| **Dagster** | Pipeline run with logs, metadata, artifacts, events, validations ≈ Run detail (Logs, Validations, Screenshots, Artifacts, Autofix) | Pipeline run UI layout; asset checks and run lineage; our Template Proofing page mirrors their run + asset validation UX. |
| **Langfuse** | trace → spans → events → logs ≈ run → job_run → tool_calls → log_entries | Structured LLM logs + UI inspection; our run_observability_events are “spans” keyed by run_id. |
| **Prefect** | TaskRun (timestamp, message, level) ≈ run_log_entries (run_id, message, logged_at, level) | Same shape; we already match it. |
| **OpenTelemetry** | Source → Collector → Processor → Exporter | Our ingest = collector pipeline; use OTel concepts (resource, severity, attributes) in run_log_entries / run_observability_events where useful. |
| **Buildkite Test Analytics** | run suite → collect results → store failures → UI → rerun failing | Same as template proofing: run templates → collect validations → store failures → Console → rerun failing templates. |
| **Airbyte** | Connector → Job → Logs → DB → UI | Same as Runner → Run → Logs → Control Plane → Console. |
| **Evidently AI** | run → metrics → checks → report | Same as run → validations → report; we have validations + suggested_fixes. |
| **Playwright** | render UI → screenshot → compare baseline → fail if mismatch | Future: render email → screenshot → compare baseline → validation; we’re implementing screenshot capture and visual validators first. |
| **Trigger.dev** | background jobs + logs + UI | Our proof batches + workers + Logs tab + Template Proofing page. |

Dagster is the closest single reference for “run + logs + artifacts + validations + UI”; we already have the same conceptual stack.

### 19.3 Event model: unified feed vs current split

**Feedback:** “Better architecture: run_events with type: log | validation | artifact | tool_call so the system is easier to query and extend.”

**Current design in this plan:**

- **run_events** (existing): Lifecycle only — queued, started, succeeded, failed, etc. One row per state transition.
- **run_log_entries** (new): Raw log lines from Render/runner; evidence, not yet classified.
- **run_observability_events** (new): Derived, typed events (asset_check, content_check, render_check, visual_check) with code, severity, payload; what we query for “why did this fail?”
- **validations** (existing): One row per check result (pass/fail, validator_type, code, evidence).

So we have four stores keyed by run_id (and job_run_id where relevant). A **unified “run timeline”** is: “everything that happened in this run in order” = run_events (by created_at) + run_observability_events (by logged_at) + validation rows (by created_at) + optional artifact-created events. That is equivalent to a single table with `event_kind in ('lifecycle','log','observability','validation','artifact')` and a payload, but we keep separate tables because (1) lifecycle is already in run_events and used by the rest of the stack, (2) raw logs have different retention and volume than derived events, (3) validations have their own schema (validator_type, status, report_artifact_id).

**Recommendation:** Keep the current split. Add a **unified read path** where it matters: e.g. “GET /v1/runs/:id/timeline” or a Console “Run timeline” that merges run_events, run_observability_events, and validations (and optionally log_entries) ordered by time. That gives one place to answer “what happened?” without migrating to a single run_events table. If we later need a single event store for replay or audit export, we can add a materialized view or an event-sink that writes a copy of observability_events + validation summaries into a generic run_events table with event_kind; not required for v1.
