# Artifact hygiene (Phase 1)

**Invariant:** Any path that may serialize artifact body into model context must use **`loadArtifactContentForLlm`** or **`loadPredecessorContentsForLlm`** (runners/src/artifact-content.ts). No raw artifact body may enter an LLM prompt except through these helpers.

## Helpers

- **`loadArtifactContentForLlm(client, artifactId, maxChars?, maxBytes?)`** — Load one artifact’s content, capped and safe for prompts.
- **`loadPredecessorContentsForLlm(client, artifacts, options?)`** — Load multiple artifacts (e.g. predecessor_artifacts), labeled by artifact_type, with per-artifact and total caps. Use for any handler that sends predecessor content to an LLM.
- **Constants:** `MAX_ARTIFACT_CHARS_FOR_LLM` (default 15_000), `MAX_ARTIFACT_BYTES_SERIALIZED` (default 50_000), `MAX_PREDECESSOR_CHARS_TOTAL` (default 40_000).
- **Fallback:** If `metadata_json.content` is string → use it; else if `metadata_json.summary` is string → use it; else → `JSON.stringify(metadata_json)` with stable key ordering, then apply byte/char limits and append `\n[truncated...]` when truncated.

## Where artifact content reaches the LLM

All of the following use the helpers so the LLM is actively connected to artifact content:

| Location | Helper | Use |
|----------|--------|-----|
| **handlers/index.ts** (design, codegen, unit_test, code_review, write_patch, plan_migration, apply_batch) | `loadPredecessorContentsForLlm` | Predecessor artifact content in prompt. |
| **handlers/index.ts** (email_generate_mjml) | `loadArtifactContentForLlm` | Predecessor copy/campaign_brief artifact loaded and passed as `predecessor_copy_for_llm` into the email handler; merged into campaign prompt for LLM copy generation. |
| **handlers/landing-page-generate.ts** | `loadArtifactContentForLlm` | Copy artifact content for landing page. |
| **handlers/slop-guard.ts** | `loadArtifactContentForLlm` | Artifact content passed to evaluator. |
| **handlers/email-generate-mjml.ts** | (receives `predecessor_copy_for_llm` from index) | Campaign prompt includes predecessor copy when pipeline has copy → email; content is always loaded via helper in index. |

## Paths that do not build prompts

These paths read artifact metadata or body but **do not** put it into any LLM prompt; they use it only for structured data (e.g. URLs, matches) or verification (e.g. length check). If we ever add prompt-building at these call sites, that path must use the helper.

- **handlers/index.ts** (post-write verification) — Reads `metadata_json` for stored length vs generated length check only.
- **handlers/seo-url-matcher.ts** — Loads predecessor inventories for URL arrays; server-side matching only.
- **handlers/seo-redirect-verifier.ts** — Loads match report for redirect verification (HTTP); no prompt.
- **handlers/seo-utils.ts** — `loadArtifactMetadata` / `loadArtifactMetadataBatch` return structured data for processing (URLs, matches). Any caller that later passes such data into an LLM must use the helper at the prompt-building site.
- **Klaviyo features** (Control Plane / Console) — Push templates and campaigns to Klaviyo via API; no runner handler sends artifact body to an LLM. If a future Klaviyo flow used artifact content in an LLM prompt, it would use the helper.

## Code review

- Prompt builders, evaluators, validators, comparison prompts, and repair prompts must use `loadArtifactContentForLlm` or `loadPredecessorContentsForLlm` when artifact-derived content is used. There are no exceptions: every path that sends artifact body to an LLM goes through these helpers.

---

## Artifact/Knowledge graph (100%)

The **Artifact/Knowledge graph** models: producer, consumers (via `artifact_consumption`), **derived_from** (artifact → artifact), **scope** (belongs_to run/initiative/project), and **referenced_by** (which pages reference this artifact).

- **Migration:** `supabase/migrations/20250331000012_artifact_knowledge_graph.sql` — adds `artifacts.derived_from_artifact_id`, `artifacts.scope_type`, `artifacts.scope_id`, and table `artifact_page_references(artifact_id, page_ref, ref_type)`.
- **GET /v1/graph/lineage/:artifactId** — Returns `declared_producer`, `observed_consumers`, `derived_from`, `scope`, `part_of_project`, `referenced_by`.
- **PATCH /v1/artifacts/:id/knowledge** — Set `derived_from_artifact_id`, `scope_type`, `scope_id` (body: any subset).
- **POST /v1/artifacts/:id/referenced_by** — Add a page reference (body: `page_ref`, optional `ref_type`). Idempotent per (artifact_id, page_ref).

Runners or jobs should set `derived_from_artifact_id` when an artifact is generated from another (e.g. image from prompt); set `scope_type`/`scope_id` when the artifact belongs to an initiative or project; and call **referenced_by** when a page or view links to the artifact.
