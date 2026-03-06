# Phase 5 Email Editor — Open-Source Alternatives We Can Take From

We no longer use Easy Email Pro. Our in-console editor (Phase 5) is **Option B**: source (HTML/MJML) + iframe preview + PATCH save. This doc is **one place for the team**: each project, what we can take, and how it fits Phase 5.

---

## Open-source editors we can take from (fork / integrate)

| Project | What we can take | How it fits Phase 5 |
|--------|-------------------|----------------------|
| [zalify/easy-email-editor](https://github.com/zalify/easy-email-editor) | MIT, React + MJML, drag-and-drop, block JSON. npm: `easy-email-core`, `easy-email-editor`, `easy-email-extensions`. | **Best Option A:** Add as a “Visual” tab. We already have `metadata.mjml` sometimes; load MJML → editor (or empty + paste). On save, export MJML/HTML and call our existing `PATCH /v1/artifacts/:id`. |
| [unlayer/react-email-editor](https://github.com/unlayer/react-email-editor) | React wrapper, `loadDesign` / `exportHtml`. ~5.1k stars. | Use as another visual editor if Unlayer is self-hostable and license is OK. Export HTML → same PATCH. |
| [usewaypoint/email-builder-js](https://github.com/usewaypoint/email-builder-js) | MIT, block-based, JSON or HTML. `@usewaypoint/email-builder`, playground. | Use builder UI; store block JSON in metadata and HTML in content. Slightly different model (block-first). |
| [knowankit/email-editor](https://github.com/knowankit/email-editor) | Next.js, Zustand, MUI, MJML, undo/redo, Unsplash, code + preview. | **Ideas only:** undo/redo, desktop vs mobile preview, Code vs Design tabs. No need to fork; we already have source + preview. |
| [GitHub topic: email-editor](https://github.com/topics/email-editor?o=desc&s=updated) | List of email-editor repos. | Use for finding more options and comparing approaches. |

### Practical recommendation

- **First thing to “fork into” Phase 5:** **[zalify/easy-email-editor](https://github.com/zalify/easy-email-editor)** — Same world (React, MJML), MIT, and we already emit MJML in metadata. Add it as an optional Visual tab; handle MJML ↔ their block JSON; keep saving via our PATCH.
- **If you want block-based storage:** **[usewaypoint/email-builder-js](https://github.com/usewaypoint/email-builder-js)** — Use their builder and store their JSON in metadata plus rendered HTML in content.
- **UX upgrades (no fork):** From [knowankit/email-editor](https://github.com/knowankit/email-editor), add undo/redo and a desktop/mobile preview toggle to our current edit page.

---

## Project details (reference)

### 1. [zalify/easy-email-editor](https://github.com/zalify/easy-email-editor) — **Best fit for Option A**

- **License:** MIT  
- **Stack:** React, MJML, TypeScript. npm: `easy-email-core`, `easy-email-editor`, `easy-email-extensions`, `react-final-form`.  
- **What it is:** Drag-and-drop email editor; data is block-based JSON (`IEmailTemplate`: `content`, `subject`, `subTitle`).  
- **Live demo:** [open-source.easyemail.pro](https://open-source.easyemail.pro).

**What we can take:** Use as the “Visual” tab in our edit page. Our pipeline already sometimes stores `metadata_json.mjml`; we can load MJML → editor (or their JSON if we add a converter). On save, export to MJML/HTML and call existing `PATCH /v1/artifacts/:id`. No change to artifact schema if we keep storing HTML in `content` and optional MJML in `metadata.mjml`.

**Install (when adding Option A):**
```bash
npm install easy-email-core easy-email-editor easy-email-extensions react-final-form
```

---

## 2. [unlayer/react-email-editor](https://github.com/unlayer/react-email-editor)

- **License:** MIT (wrapper). Unlayer editor may have separate terms for self-host/embed.  
- **What it is:** React wrapper around Unlayer’s drag-n-drop editor. Methods: `loadDesign`, `saveDesign`, `exportHtml`.  
- **Stars:** ~5.1k.

**What we can take:** If the underlying editor is self-hostable and free for our use, we could offer it as an alternative visual editor; export HTML and send via our PATCH. **Action:** Confirm Unlayer’s self-host and commercial terms before depending on it.

---

## 3. [usewaypoint/email-builder-js](https://github.com/usewaypoint/email-builder-js)

- **License:** MIT  
- **What it is:** Block-based email builder. Output: **JSON** or **HTML**. Package: `@usewaypoint/email-builder`; `renderToStaticMarkup(config, { rootBlockId: 'root' })` for HTML.  
- **Playground:** [usewaypoint.github.io/email-builder-js](https://usewaypoint.github.io/email-builder-js/)  
- **Blocks:** Avatar, Button, Columns, Container, Divider, Heading, HTML, Image, Spacer.

**What we can take:** Use the builder UI and store **block JSON** in `metadata_json` (e.g. `template_json`) and rendered **HTML** in `metadata_json.content`. Different model than “HTML-only”; would need a migration or dual support (HTML-only vs block JSON).

---

## 4. [knowankit/email-editor](https://github.com/knowankit/email-editor)

- **Stack:** Next.js, Zustand, MUI, MJML, drag-and-drop.  
- **Features:** Undo/redo, local save, Unsplash images, code view, mobile/desktop preview.

**What we can take:** **Ideas only** — e.g. undo/redo stack, desktop vs mobile preview toggle, explicit “Code” vs “Design” tabs. We don’t fork the repo; we already have source + preview; we can add these UX improvements to our Phase 5 page.

---

## 5. [GitHub topic: email-editor](https://github.com/topics/email-editor?o=desc&s=updated)

Curated list of email-editor repos (Easy Email, Unlayer, EmailBuilder.js, etc.). Useful for discovery and comparison.

---

## Our current implementation (Option B)
- **Control plane:** `PATCH /v1/artifacts/:id` in `control-plane/src/api.ts` — updates `metadata_json.content` and/or merges `metadata`; operator+ only; 2MB max content.
- **Console:** Shared `EmailArtifactEditor` in `console/src/components/email-artifact-editor.tsx`; used by:
  - `console/app/email-marketing/runs/[runId]/artifacts/[artifactId]/edit/page.tsx`
  - `console/app/email-marketing/artifacts/[artifactId]/edit/page.tsx` (artifact-only; runId from artifact).
- **Campaign edit:** `console/app/email-marketing/campaigns/[id]/edit/page.tsx` loads campaign, resolves `template_artifact_id`, and redirects to `/email-marketing/artifacts/:id/edit`.
- **API client:** `console/src/lib/api.ts` (`getArtifactContent`, `updateArtifact`, `UpdateArtifactPayload`); `use-api.ts` (`useArtifactContent`, `useUpdateArtifact`).
