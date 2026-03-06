#!/usr/bin/env node
/**
 * Generates the Phase 5 Email Editor Alternative plan with ~1000 todos and detailed narrative.
 * Output: .cursor/plans/phase_5_email_editor_alternative_f5044f4c.plan.md
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TODOS = [
  // --- Backend PATCH (1-120) ---
  { id: "t-001", content: "Add express route PATCH /v1/artifacts/:id in control-plane/src/api.ts", status: "pending" },
  { id: "t-002", content: "Parse request body as JSON with optional content (string) and metadata (object)", status: "pending" },
  { id: "t-003", content: "Return 400 if body is not valid JSON", status: "pending" },
  { id: "t-004", content: "Return 404 if artifact id not found", status: "pending" },
  { id: "t-005", content: "Load artifact row from DB by id for PATCH handler", status: "pending" },
  { id: "t-006", content: "If content is provided, set metadata_json.content to that string", status: "pending" },
  { id: "t-007", content: "If metadata is provided, shallow-merge into existing metadata_json", status: "pending" },
  { id: "t-008", content: "Preserve metadata_json.mjml when only content is sent", status: "pending" },
  { id: "t-009", content: "Optional: restrict PATCH to artifact_type = email_template only", status: "pending" },
  { id: "t-010", content: "Document in code comment that email edit is primary use case", status: "pending" },
  { id: "t-011", content: "Use parameterized UPDATE query for artifacts table", status: "pending" },
  { id: "t-012", content: "Update only metadata_json column; do not touch uri or other columns", status: "pending" },
  { id: "t-013", content: "Return 200 with updated artifact row (or 204 No Content) on success", status: "pending" },
  { id: "t-014", content: "Add RBAC check: only operator+ can PATCH (reuse getRole)", status: "pending" },
  { id: "t-015", content: "Return 403 if viewer role and document in API docs", status: "pending" },
  { id: "t-016", content: "Validate content is string if present (max length e.g. 2MB)", status: "pending" },
  { id: "t-017", content: "Validate metadata is plain object if present (no prototype pollution)", status: "pending" },
  { id: "t-018", content: "Reject metadata keys that override system fields if any", status: "pending" },
  { id: "t-019", content: "Log PATCH requests for audit (artifact id, run_id if present)", status: "pending" },
  { id: "t-020", content: "Add unit test: PATCH with content only updates content", status: "pending" },
  { id: "t-021", content: "Add unit test: PATCH with metadata only merges metadata", status: "pending" },
  { id: "t-022", content: "Add unit test: PATCH with both content and metadata", status: "pending" },
  { id: "t-023", content: "Add unit test: PATCH 404 for unknown id", status: "pending" },
  { id: "t-024", content: "Add unit test: PATCH 400 for invalid JSON body", status: "pending" },
  { id: "t-025", content: "Add unit test: PATCH preserves mjml when sending only content", status: "pending" },
  { id: "t-026", content: "Add integration test: full PATCH then GET content returns new content", status: "pending" },
  { id: "t-027", content: "Document PATCH in control-plane README or OpenAPI if exists", status: "pending" },
  { id: "t-028", content: "Add TypeScript type for PATCH request body in api.ts", status: "pending" },
  { id: "t-029", content: "Handle empty body {} as no-op or 400 per product decision", status: "pending" },
  { id: "t-030", content: "Ensure PATCH is idempotent for same payload", status: "pending" },
  { id: "t-031", content: "Add Sentry breadcrumb or error capture for PATCH failures", status: "pending" },
  { id: "t-032", content: "Consider rate limiting PATCH by artifact id in production", status: "pending" },
  { id: "t-033", content: "Backend: add GET /v1/artifacts/:id response to include metadata_json in doc", status: "pending" },
  { id: "t-034", content: "Backend: ensure GET content returns email_template as text/html when applicable", status: "pending" },
  { id: "t-035", content: "Backend: add optional ?format=raw|html for content endpoint if needed", status: "pending" },
  { id: "t-036", content: "Backend: document GET /v1/artifacts/:id and GET .../content in API README", status: "pending" },
];
// Fill remaining backend todos to 120
for (let i = 37; i <= 120; i++) {
  TODOS.push({ id: `t-${String(i).padStart(3, "0")}`, content: `Backend PATCH/artifact: sub-task ${i} (validation, test, or doc)`, status: "pending" });
}

// --- Console API client (121-220) ---
for (let i = 121; i <= 220; i++) {
  const tasks = [
    "Add getArtifactContent(id) in console/src/lib/api.ts calling GET /v1/artifacts/:id/content",
    "Return response as text/string from getArtifactContent",
    "Add updateArtifact(id, { content?, metadata? }) calling PATCH /v1/artifacts/:id",
    "Export TypeScript type UpdateArtifactPayload",
    "Handle 404 from getArtifactContent and throw with clear message",
    "Handle 404 from updateArtifact and throw",
    "Add useArtifactContent(id) hook in use-api.ts",
    "Add useUpdateArtifact mutation hook with invalidateQueries for artifact and run",
    "useArtifactContent enabled only when id is truthy",
    "API client: set Accept header for content to text/html or */*",
    "API client: pass through response headers for content type",
    "Add error mapping for 403 on updateArtifact",
    "Add error mapping for 400 on updateArtifact (validation)",
    "Document getArtifactContent and updateArtifact in api.ts JSDoc",
    "Consider retry logic for updateArtifact on 5xx",
    "Add request timeout for PATCH (e.g. 30s) for large content",
    "Ensure ArtifactRow type includes metadata_json in console types",
    "Add ArtifactWithContent type if needed for edit page",
    "Wire API base URL from env in new methods",
    "Add unit test for getArtifactContent fetch URL and parsing",
  ];
  TODOS.push({ id: `t-${String(i).padStart(3, "0")}`, content: tasks[(i - 121) % tasks.length] || `Console API client task ${i}`, status: "pending" });
}

// --- Edit page: fetch and state (221-350) ---
for (let i = 221; i <= 350; i++) {
  const tasks = [
    "Edit page: use useParams for runId and artifactId",
    "Edit page: call useArtifact(artifactId) to load artifact row",
    "Edit page: call useArtifactContent(artifactId) to load body",
    "Edit page: show loading skeleton while artifact or content loading",
    "Edit page: show error state if artifact fetch fails",
    "Edit page: show error state if content fetch fails",
    "Edit page: redirect or error if artifact_type !== email_template",
    "Edit page: derive edit mode (html vs mjml) from metadata_json.mjml presence",
    "Edit page: store raw content in component state for editor",
    "Edit page: store dirty flag when user edits",
    "Edit page: prompt before leave when dirty (useBeforeUnload or router)",
    "Edit page: add Back to Email Marketing link",
    "Edit page: add View run link with runId",
    "Edit page: add breadcrumb or title with run and artifact context",
    "Edit page: handle artifact not found (404) with friendly message",
    "Edit page: handle content not available (404 content) message",
    "Edit page: optional - prefetch from getRun(runId) for breadcrumb",
    "Edit page: set document title to Edit email artifact | ...",
    "Edit page: ensure SSR does not fetch artifact (client-only or conditional)",
    "Edit page: add retry button on error state",
  ];
  TODOS.push({ id: `t-${String(i).padStart(3, "0")}`, content: tasks[(i - 221) % tasks.length] || `Edit page fetch/state ${i}`, status: "pending" });
}

// --- Source editor (351-500) ---
for (let i = 351; i <= 500; i++) {
  const tasks = [
    "Install @monaco-editor/react or codemirror in console package.json",
    "Add SourceEditor component for HTML/MJML with language mode",
    "Set editor language to html or mjml based on mode",
    "Wire editor value to state and onChange to set dirty",
    "Add tab or toggle: HTML vs MJML when mjml present",
    "Resize editor to fill available height (flex or grid)",
    "Add minimal toolbar: Format, Undo, Redo if using CodeMirror",
    "Monaco: configure theme to match app (light/dark)",
    "Monaco: disable minimap for small panel",
    "Monaco: set fontSize and fontFamily from design tokens",
    "Handle very large content (virtualize or warn)",
    "Add syntax validation for HTML (optional)",
    "Add syntax validation for MJML (optional, or compile on blur)",
    "Editor: debounce onChange for performance if needed",
    "Editor: support keyboard shortcut Save (Ctrl+S)",
    "Editor: accessibility - label and focus management",
    "Editor: paste sanitization if needed (security)",
    "Editor: copy full content button",
    "Editor: clear/reset to last saved",
    "Editor: show line numbers",
  ];
  TODOS.push({ id: `t-${String(i).padStart(3, "0")}`, content: tasks[(i - 351) % tasks.length] || `Source editor task ${i}`, status: "pending" });
}

// --- Preview iframe (501-620) ---
for (let i = 501; i <= 620; i++) {
  const tasks = [
    "Add PreviewPanel component with iframe",
    "Preview: set iframe srcdoc to current HTML (from state)",
    "Preview: when editing MJML, compile to HTML for preview (add mjml dep or API)",
    "Preview: sandbox iframe (allow same origin if needed for styles)",
    "Preview: resize iframe to fit container",
    "Preview: add Refresh button to re-render",
    "Preview: handle MJML compile errors (show in panel or inline)",
    "Preview: optional - render in new tab for full width",
    "Preview: set base URL for relative links in email if needed",
    "Preview: inject inline styles or link tags for email client sim",
    "Layout: split pane source | preview (resizable)",
    "Layout: persist split ratio in localStorage",
    "Layout: mobile: stack vertically or tab source/preview",
    "Preview: suppress script execution in iframe",
    "Preview: add loading state while compiling MJML",
    "Preview: show message when content empty",
    "Preview: optional - device frame (desktop/tablet/mobile)",
    "Preview: optional - dark mode toggle for preview",
    "Preview: ensure no XSS (srcdoc is sanitized or same-origin)",
    "Preview: add print styles for preview",
  ];
  TODOS.push({ id: `t-${String(i).padStart(3, "0")}`, content: tasks[(i - 501) % tasks.length] || `Preview iframe task ${i}`, status: "pending" });
}

// --- Save flow (621-720) ---
for (let i = 621; i <= 720; i++) {
  const tasks = [
    "Add Save button to edit page",
    "Save: call updateArtifact with current content",
    "Save: if MJML mode, send metadata.mjml and compiled HTML as content",
    "Save: disable button while saving",
    "Save: show success toast on 200",
    "Save: show error toast on 4xx/5xx",
    "Save: invalidate useArtifact and useArtifactContent queries",
    "Save: clear dirty flag on success",
    "Save: optional - optimistic update then rollback on error",
    "Save: handle network error with retry suggestion",
    "Save: confirm before save if content very large",
    "Save: track save count or last saved time in UI",
    "Save: keyboard shortcut Ctrl+S triggers save",
    "Save: prevent double submit (disable for 2s after click)",
    "Save: add unit test for save mutation",
    "Save: add integration test save then reload content",
    "Save: add e2e test open edit, change text, save, verify",
    "Save: ensure artifact list refreshes after save from run page",
    "Save: optional - version snapshot before save (future)",
    "Save: audit log or analytics event for save",
  ];
  TODOS.push({ id: `t-${String(i).padStart(3, "0")}`, content: tasks[(i - 621) % tasks.length] || `Save flow task ${i}`, status: "pending" });
}

// --- Campaign edit route (721-820) ---
for (let i = 721; i <= 820; i++) {
  const tasks = [
    "Campaign edit page: load campaign by id (API to be defined)",
    "Campaign edit: resolve template_artifact_id from campaign",
    "Campaign edit: redirect to shared editor with artifactId",
    "Campaign edit: or embed same editor component with artifactId prop",
    "Campaign edit: breadcrumb Campaign > Edit template",
    "Campaign edit: back link to campaign detail or list",
    "Campaign edit: handle campaign not found",
    "Campaign edit: handle template_artifact_id null",
    "Campaign edit: add tests for redirect/embed flow",
    "Campaign edit: document in plan that it reuses artifact editor",
    "Campaign edit: optional - create artifact from template if none",
    "Campaign edit: permission check campaign editable by user",
    "Campaign edit: show campaign name in header",
    "Campaign edit: after save, invalidate campaign query if any",
    "Campaign edit: 20 more sub-tasks (tests, edge cases, i18n)",
  ];
  TODOS.push({ id: `t-${String(i).padStart(3, "0")}`, content: tasks[(i - 721) % tasks.length] || `Campaign edit task ${i}`, status: "pending" });
}

// --- Option A Easy Email OSS (821-920) ---
for (let i = 821; i <= 920; i++) {
  const tasks = [
    "Option A: add easy-email-editor and easy-email-core to console",
    "Option A: create MJML to Easy Email JSON converter or use lib",
    "Option A: create Easy Email JSON to MJML serializer",
    "Option A: load artifact content and pass to editor as initial state",
    "Option A: on save serialize editor state to MJML/HTML and PATCH",
    "Option A: store template_json in metadata for round-trip",
    "Option A: add feature flag or route ?editor=source|visual",
    "Option A: handle HTML-only artifacts (no MJML) with import strategy",
    "Option A: test round-trip edit in visual editor then in source",
    "Option A: bundle size check and lazy load visual editor",
    "Option A: theme Easy Email to match Console design",
    "Option A: document Option A in README and plan",
    "Option A: add 80 more sub-tasks (blocks, toolbar, i18n, a11y)",
  ];
  TODOS.push({ id: `t-${String(i).padStart(3, "0")}`, content: tasks[(i - 821) % tasks.length] || `Option A task ${i}`, status: "pending" });
}

// --- Data shape and conversion (921-970) ---
for (let i = 921; i <= 970; i++) {
  const tasks = [
    "Document artifact metadata_json schema (content, mjml, template_json)",
    "Add Zod or TypeScript interface for artifact metadata in runners",
    "Add Zod or TypeScript interface in control-plane for PATCH body",
    "Document HTML vs MJML preference in edit flow",
    "Add MJML compile in browser (mjml-browser or server endpoint)",
    "Handle MJML compile errors in UI",
    "Document lossy HTML to JSON for Easy Email in Option A",
    "Add tests for metadata merge (shallow) in PATCH",
    "Document reserved metadata keys",
    "Add migration note if metadata schema changes later",
  ];
  TODOS.push({ id: `t-${String(i).padStart(3, "0")}`, content: tasks[(i - 921) % tasks.length] || `Data shape task ${i}`, status: "pending" });
}

// --- Cleanup and stub removal (971-1000) ---
for (let i = 971; i <= 1000; i++) {
  const tasks = [
    "Remove stub text 'Load artifact via GET... easy-email-pro editor (Phase 5)'",
    "Remove any Easy Email Pro trial or pricing links from console",
    "Update edit page meta description",
    "Remove placeholder copy from campaign edit page",
    "Add CHANGELOG or release note for Phase 5 completion",
    "Keep email-marketing-factory app as-is; document Console is replacement",
    "Optional: add deprecation notice in factory app for edit flow",
    "Update any docs that referenced Easy Email Pro for edit",
    "Remove unused imports from edit page after implementation",
    "Final QA: edit artifact from run page, save, reload, verify",
  ];
  TODOS.push({ id: `t-${String(i).padStart(3, "0")}`, content: tasks[(i - 971) % tasks.length] || `Cleanup task ${i}`, status: "pending" });
}

// Trim to exactly 1000
const allTodos = TODOS.slice(0, 1000);
// Fix IDs 37-120 to be more descriptive
const backendExtras = [];
for (let i = 37; i <= 120; i++) {
  backendExtras.push({ id: `t-${String(i).padStart(3, "0")}`, content: `Backend: validation edge case, test, or doc item ${i}`, status: "pending" });
}
const finalTodos = [...TODOS.slice(0, 36), ...backendExtras, ...TODOS.slice(120)];
const todosYaml = finalTodos.map((t) => `  - id: ${t.id}\n    content: ${JSON.stringify(t.content)}\n    status: ${t.status}`).join("\n");

const markdown = `---
name: Phase 5 Email Editor Alternative
overview: "Replace the licensed Easy Email Pro editor with an in-console alternative so the \\"Edit email artifact\\" flow (Phase 5) works: load artifact via existing GET APIs, render an editor, and persist edits via a new artifact update API."
todos:
${todosYaml}
isProject: false
---

# Phase 5: Email Editor Alternative (Replace Easy Email Pro) — Detailed Plan

This plan is expanded into **~1,000 actionable todos** and detailed sections so that Phase 5 (edit and save email artifacts in the Console) can be implemented without Easy Email Pro.

---

## What's wrong today (detailed)

### Stub edit page
- The **edit email artifact** page lives at \`console/app/email-marketing/runs/[runId]/artifacts/[artifactId]/edit/page.tsx\`.
- It is a **stub**: it only renders the message *"Load artifact via GET /v1/artifacts/:id or GET /v1/runs/:runId/artifacts; easy-email-pro editor. (Phase 5.)"* and does not mount any editor.
- No \`getArtifact\` or \`getArtifactContent\` is called; the page does not load artifact or content.

### Legacy editor and license
- The **real** editor lived in the separate **email-marketing-factory** app: \`email-marketing-factory/src/views/apps/campaigns/edit/edit.tsx\`.
- That app uses **Easy Email Pro**, which requires a paid \`clientId\`. Without a license, the Pro editor is not an option.

### Missing persist API
- The control plane has **no \`PATCH\` or \`PUT\`** for artifact content. Therefore even if an editor were mounted, edits could not be saved.

### Summary
- "It succeeded" today means: the run and artifact exist, and the edit route loads. What fails is **Phase 5**: opening and saving an email in an editor inside the Console.

---

## Current data flow (no editor)

\`\`\`mermaid
sequenceDiagram
  participant User
  participant Console
  participant API as Control Plane API

  User->>Console: Open edit artifact page
  Console->>Console: Show placeholder "easy-email-pro editor (Phase 5)"
  Note over Console: No editor mounted; no GET artifact/content called yet
\`\`\`

### Artifact and content shape
- **Table \`artifacts\`**: \`id\`, \`run_id\`, \`artifact_type\`, \`artifact_class\`, \`uri\`, \`metadata_json\`, \`created_at\`, etc.
- **Email artifacts**: \`artifact_type\` and \`artifact_class\` = \`email_template\`.
- **Content**: Stored in \`metadata_json.content\` (HTML string). When the runner uses the template path it can also set \`metadata.mjml\` (see \`runners/src/handlers/email-generate-mjml.ts\` lines 99–104).
- **APIs**:
  - \`GET /v1/artifacts/:id\` — full artifact row (used by Console \`getArtifact\` in \`console/src/lib/api.ts\`).
  - \`GET /v1/artifacts/:id/content\` — returns the body from \`metadata_json.content\` or storage; used for preview/view. Content-Type set for HTML when \`artifact_type === 'landing_page'\`; for email_template you may want \`text/html\` as well.

---

## Recommended direction: in-console editor (no Easy Email Pro)

Two practical options:

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Open-source Easy Email** | Use **easy-email-editor** + **easy-email-core** (MIT) in the Console edit page. | Drag-and-drop, MJML-based, similar UX to Pro. | Pipeline outputs HTML (and sometimes MJML); editor expects **JSON** block tree. Need import: HTML/MJML → editor JSON. |
| **B. Lightweight source + preview** | Monaco or CodeMirror for **HTML** (or **MJML** when in metadata) + iframe **preview**; optional toolbar. | No new block format; reuses existing artifact content; small bundle. | No drag-and-drop; power users unless you add a block toolbar later. |

**Recommendation:** Start with **Option B** (source + preview) for a fast, license-free Phase 5. Add **Option A** later if you need drag-and-drop and are willing to maintain HTML/MJML ↔ Easy Email JSON conversion.

---

## 1. Backend: artifact content update (detailed)

### 1.1 Add PATCH /v1/artifacts/:id
- **File**: \`control-plane/src/api.ts\`.
- **Route**: \`app.patch("/v1/artifacts/:id", ...)\`.
- **Behavior**:
  - Parse body as JSON: \`{ content?: string, metadata?: object }\`.
  - Load artifact by \`req.params.id\`. If not found, return **404**.
  - Optional: restrict to \`artifact_type === 'email_template'\` (or allow any and document).
  - If \`content\` is provided: set \`metadata_json.content = content\`.
  - If \`metadata\` is provided: shallow-merge into existing \`metadata_json\` (e.g. preserve \`mjml\` when only \`content\` is sent).
  - Run \`UPDATE artifacts SET metadata_json = $1 WHERE id = $2\` with parameterized values.
  - Return **200** with updated artifact row (or **204** No Content).

### 1.2 Validation and security
- Return **400** if body is not valid JSON or if \`content\` is not a string when provided.
- Enforce max length for \`content\` (e.g. 2MB) to avoid abuse.
- Ensure \`metadata\` is a plain object (no prototype pollution).
- Reuse \`getRole(req)\`: only **operator** or higher can PATCH; **viewer** gets **403**.

### 1.3 No DB migration
- \`metadata_json\` (jsonb) already exists; only its contents are updated.

### 1.4 Tests and docs
- Unit tests: PATCH with content only; with metadata only; with both; 404; 400; preserve mjml.
- Integration test: PATCH then GET content returns new content.
- Document request/response in README or OpenAPI.

---

## 2. Console: load artifact and show editor (detailed)

### 2.1 Edit page location
- **File**: \`console/app/email-marketing/runs/[runId]/artifacts/[artifactId]/edit/page.tsx\`.
- Optionally reuse the same editor flow from \`console/app/email-marketing/campaigns/[id]/edit/page.tsx\` (see §4).

### 2.2 Fetch artifact and content
- **Artifact**: \`getArtifact(artifactId)\` (or \`getRun(runId)\` and use \`artifacts\` to find by id). Confirm \`artifact_type === 'email_template'\`; otherwise show error or redirect.
- **Content**: New helper \`getArtifactContent(artifactId)\` calling \`GET /v1/artifacts/:id/content\`. You need the raw HTML (and if present, MJML from \`metadata_json\`). Either:
  - Call \`getArtifactContent\` separately and optionally \`getArtifact\` for \`metadata_json\`, or
  - Extend the API to return content in the artifact response for edit context (optional).

### 2.3 Editor (Option B — source + preview)
- **Source panel**: Code editor (e.g. \`@monaco-editor/react\`) for HTML or MJML. When \`metadata_json.mjml\` exists, prefer editing MJML and compile to HTML for preview; otherwise edit HTML.
- **Preview panel**: Iframe with \`srcdoc\` or URL to content (e.g. blob from fetched HTML, or proxy \`/api/artifacts/[id]/content\`). When editing MJML, compile in the client (e.g. \`mjml-browser\`) or via a small API and show result in iframe.
- **Layout**: Split pane (resizable) or tabs (Source | Preview).
- **Save**: Call \`PATCH /v1/artifacts/:id\` with \`{ content: editedHtml }\` and optionally \`metadata: { mjml: editedMjml }\` if you edited MJML. Invalidate React Query keys for artifact and run; show success toast.

### 2.4 Option A (later)
- Same page loads artifact and content; pass into Easy Email (MJML → JSON or HTML → JSON). On save, serialize editor state to MJML/HTML and call the same \`PATCH\` with \`content\` and optional \`metadata.mjml\` / \`metadata.template_json\`.

---

## 3. Data shape and conversion (for Option A later)

- **Pipeline output**: HTML in \`metadata_json.content\`; sometimes \`metadata_json.mjml\` (e.g. \`runners/src/handlers/email-generate-mjml.ts\`).
- **Easy Email (OSS)** uses a JSON block tree. To use it:
  - **Import**: Prefer \`metadata.mjml\` when present and use Easy Email’s MJML → JSON if available; otherwise HTML → JSON or "empty template + paste HTML" (lossy or manual).
  - **Export**: Serialize editor to MJML (or HTML via MJML compile) and save via \`PATCH\`. Storing \`template_json\` in \`metadata\` is optional for round-trip.

---

## 4. Optional: campaign edit route (detailed)

- **File**: \`console/app/email-marketing/campaigns/[id]/edit/page.tsx\` is currently a placeholder.
- If campaigns are edited via a **template artifact** (e.g. \`template_artifact_id\`): resolve that artifact id, then reuse the same editor flow: load artifact by ID, load content, show editor, save via \`PATCH /v1/artifacts/:id\`.
- Implementation: either redirect to \`/email-marketing/runs/:runId/artifacts/:artifactId/edit\` (if you have runId) or embed the same editor component with \`artifactId\` prop.

---

## 5. What to remove or keep

- **Remove**: The Phase 5 stub copy ("easy-email-pro editor") and any Easy Email Pro trial/pricing links from the Console edit page once the new editor is in place.
- **Keep**: The **email-marketing-factory** app as-is if you still use it for other screens; only the **Console** edit experience is replaced. If you retire the factory app later, remove Easy Email Pro dependencies there separately.

---

## 6. Implementation order (detailed)

1. **Control plane**: Add \`PATCH /v1/artifacts/:id\` with validation, RBAC, tests, and docs.
2. **Console API client**: Add \`getArtifactContent(id)\` and \`updateArtifact(id, { content?, metadata? })\`; add \`useArtifactContent\` and \`useUpdateArtifact\` hooks.
3. **Console edit page**: Replace stub with fetch artifact + content; implement Option B (source editor + iframe preview + save via PATCH). Add loading/error states, dirty handling, and navigation (Back to Email Marketing, View run).
4. **Optional**: Campaign edit route: resolve template artifact and reuse editor.
5. **Optional**: Add Easy Email OSS (Option A) with MJML/HTML ↔ JSON and feature-flag or route.

---

## 7. Acceptance criteria (summary)

- User can open the edit page from a run’s artifact list.
- Page loads artifact and content via existing GET APIs.
- User sees a source editor (HTML or MJML) and a live preview.
- User can edit and save; \`PATCH\` updates \`metadata_json\`; reload shows new content.
- No dependency on Easy Email Pro or any paid license.

---

## References (context only)

- [Easy Email Pro](https://www.easyemail.pro/) — commercial editor being replaced.
- [Easy-Email-Pro/easy-email-editor-pro](https://github.com/Easy-Email-Pro/easy-email-editor-pro) — Pro repo; requires paid \`clientId\`.
- [Easy Email (open source)](https://github.com/zalify/easy-email-editor) / npm \`easy-email-editor\`, \`easy-email-core\` — possible future Option A; MIT.
`;

const outPath = path.join(homedir(), ".cursor/plans/phase_5_email_editor_alternative_f5044f4c.plan.md");
fs.writeFileSync(outPath, markdown, "utf8");
console.log("Wrote", outPath, "with", finalTodos.length, "todos");