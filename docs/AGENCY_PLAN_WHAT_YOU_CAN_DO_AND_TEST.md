# Agency Plan: What You Can Do With ProfessorX (Marketing + Development) — Then Test & Deploy

This is the **plan first**: what the system can do for a **marketing agency** and a **development agency**. After this we run the system test and deploy.

---

## 1. What ProfessorX Is

ProfessorX is the **operator console** for the AI Factory: one control surface that talks to the Control Plane API and Postgres. You use it to:

- Create and track **initiatives** (goals: a campaign, a feature, a fix).
- Compile **plans** (DAG of jobs) and, when runners are connected, run **pipeline runs**.
- Manage **brands**, **document templates**, **routing**, **budgets**, and **releases**.

---

## 2. Development Agency: What You Can Do

| Use case | How in ProfessorX | Pipeline / jobs |
|----------|--------------------|------------------|
| **Feature / product build** | Create initiative (e.g. “Q2 dashboard”), compile plan, start run | **software**: PRD → design → codegen → unit_test → code_review |
| **Bug fix / small change** | Initiative “Fix login bug”, plan | **issue_fix**: analyze_repo → write_patch → unit_test → submit_pr |
| **DB migration** | Initiative “Schema v2”, plan | **migration**: analyze_repo → plan_migration → apply_batch → unit_test |
| **Code review + fix** | Initiative “Review PR #42”, plan | **factory_ops**: code_review → codegen → write_patch |
| **CI gate** | Initiative “Gate release”, plan | **ci_gate**: code_review → unit_test (validator) |
| **Research → design → build** | Initiative “Explore X and build POC”, plan | **crew**: research → design → codegen → unit_test |
| **Self-heal (fix from issue)** | Initiative + self-heal flow | **self_heal**: analyze_repo → openhands_resolver → code_review → submit_pr |
| **SWE-agent fix** | Initiative “Fix from ticket”, plan | **swe_agent**: analyze_repo → swe_agent → unit_test → code_review → submit_pr |

**In the Console you:** create initiatives, compile plans, view runs/jobs/artifacts/tool_calls, approve gates, set routing policies and LLM budgets, manage releases and canary, run self-heal, use Admin for full CRUD.

**Test & deploy (dev):** Run a pipeline by creating an initiative, compiling a plan, and (when runners + scheduler are wired) starting a run; monitor in Planner, Runs, Jobs, Artifacts. Deploy = Control Plane (Render) + Console (Vercel) + DB migrations.

---

## 3. Marketing Agency: What You Can Do

| Use case | How in ProfessorX | Notes |
|----------|--------------------|--------|
| **Client brands** | **Brands** (`/brands`): create and edit brands; set Basic Info + design tokens (colors, typography, logo). | Design tokens drive emails, decks, and UI. |
| **Document templates** | **Document templates** (`/document-templates`): pitch decks, reports, one-pagers; define component sequence (KPI cards, tables, charts, etc.). | Linked to a brand (or global). |
| **Token system** | **Token registry** (`/tokens`): platform default tokens (read-only). **Component registry** (`/components`): block types (kpi_card, table_block, chart_block, …). | Brands override tokens; templates use components. |
| **Email campaigns** | **Email marketing** (`/email-marketing`): dedicated UI for flows, segments, templates. | Uses brand context and tokens where wired. |
| **Campaign / deliverable as “initiative”** | Create an initiative (e.g. “Acme Q2 one-pager”), compile a plan (e.g. software or issue_fix as a short pipeline), track in Dashboard / Initiatives / Plans. | Same orchestration layer; runners can run copy-generate, email-generate, deck-generate, brand-compile when connected. |

**In the Console you:** manage brands and document templates, browse token and component registries, use the email marketing UI, and (optionally) track marketing deliverables as initiatives/plans/runs like dev work.

**Test & deploy (marketing):** Create a brand and a document template, then confirm they appear in the Console and (when runners are connected) that jobs like brand-compile or deck-generate can consume them. Deploy = same stack (Console + Control Plane + DB).

---

## 4. Shared Capabilities (Both Agencies)

- **Dashboard** – overview, links to initiatives, runs, approvals.
- **Releases & canary** – control rollout and rollback.
- **Routing policies** – which model tier per job type.
- **LLM budgets** – token/spend caps by scope.
- **MCP servers** – configure MCP integrations (e.g. GitHub, Klaviyo).
- **Webhook outbox** – delivery status and retries.
- **Agent memory** – inspect per-run/initiative memory.
- **Audit / incidents / analytics** – logs and error clustering.

---

## 5. Test We Run

1. **API + DB:** Create an initiative, compile a plan (and optionally a brand).
2. **Console:** Open ProfessorX and confirm the new initiative (and plan/brand if created) appear.
3. **Deploy:** Ensure changes are committed and pushed so Render + Vercel deploy.

---

## 6. Deploy (What “Deploy” Means Here)

- **Control Plane:** Render deploys from `main` (staging) / `prod` when you push. Uses `Dockerfile.control-plane`, `render.yaml`.
- **Console:** Vercel deploys the `console/` app from `main` (preview) or production.
- **DB:** Run `npm run db:migrate:new` against each environment’s `DATABASE_URL` when you add migrations.

No separate “deploy” script; **push to the branch** triggers the deploy for that environment.
