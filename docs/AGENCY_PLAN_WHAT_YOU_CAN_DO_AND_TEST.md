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

**Local full flow (browser):** From repo root, ensure `.env` has `DATABASE_URL`. Run Control Plane: `npm run dev:control-plane` (loads `.env`). Run Console: `cd console && npm run dev`. Open http://localhost:3000 → Orchestration → Initiatives → open an initiative → **Compile plan** → **Start run** (per plan) → open run → Artifacts → **View page** for a landing_page artifact. If compile or start fails, the initiative page shows the API error inline so you can fix and retry.

---

### Can I spin up a landing page? (Marketing agency)

**Yes, via the engine.** The pipeline generates the page; you open it with a **view URL**.

**How it works**

1. **Initiative** – Create an initiative with **intent_type: landing** (or marketing). Attach a **brand** (e.g. Pharmacytime) so the runner has design_tokens and identity.
2. **Plan** – Compile the plan. The **landing** template is: copy_generate → landing_page_generate. The **marketing** template adds brand_compile and deck_generate.
3. **Run** – Start the run. When a runner is connected, it runs copy_generate (hero/CTA), then landing_page_generate (brand + copy → single HTML with header, hero, CTA).
4. **View URL** – Open **Runs** → that run → **Artifacts** tab. For the **landing_page** artifact, click **View page**. That opens the Control Plane content URL: `{CONTROL_PLANE_API}/v1/artifacts/{artifact_id}/content`, which returns the HTML so the browser renders the landing page.

So the **engine** produces the page; the **URL** to launch it is the artifact content endpoint. No separate “preview script” needed for normal use.

**Also in place**

- **Brands + design tokens** – Colors, typography, logo (including two-part wordmark e.g. Pharmacy **bold** + time *light*). Used by landing_page_generate, decks, emails.
- **Document templates** – For decks and reports. **Landing** uses copy from the predecessor artifact (copy_generate).
- **Optional deploy** – A future adapter could deploy the generated HTML to Vercel or static hosting; today you view via the artifact content URL.

---

## 3b. “So what can I actually do with what we have?”

**If you can’t spin a landing page, it can feel like you can’t do much.** Here’s what *is* there and when it’s useful.

**What works today (concrete)**

| What | Where | What you get |
|------|--------|----------------|
| **One place for client brand** | **Brands** | Colors, fonts, logo, tone in one profile. Everything that *does* generate output (emails, decks, future landing) can pull from here. So you’re not rebuilding “Acme’s blue” in every tool. |
| **Reusable deck/report templates** | **Document templates** | Define a pitch deck or report once (sections, KPI blocks, charts). When a runner generates a deck for a brand, it uses this. So: template + brand = consistent client decks. |
| **Email marketing app** | **Email Marketing** (nav) | Full app (flows, segments, templates) proxied from ProfessorX. If you use that stack, you get a single entry point from the Console. |
| **Pipeline tracking** | **Initiatives → Plans → Runs** | Track “Acme Q2 campaign” or “Client X one-pager” as an initiative, attach a plan, see runs/jobs/artifacts when the pipeline runs. So ProfessorX is your **ops view** for work that the Factory executes. |
| **Cost and control** | **Routing policies, LLM budgets** | Cap spend per job type or initiative; point jobs at cheaper/faster models where it’s safe. |

**Where it feels thin**

- **No “create landing page”** → no instant client landing pages. You only get the benefits above (brand, templates, email app, tracking).
- **Runners must be running** for initiatives to turn into real artifacts (decks, copy, etc.). Without that, ProfessorX is mostly **setup + tracking**, not “click and get a deliverable.”

**What would make it feel worth it (marketing)**

1. **Landing page job** – One pipeline step: “generate and (optionally) deploy a landing page from this brand + brief.” That’s the missing “I can do something visible for clients” piece.
2. **Clear “marketing” flow in the UI** – e.g. “New campaign” → pick client brand → pick template (deck / report / future: landing) → run. So it’s obvious that brands + templates = deliverables.

**Bottom line**

With what we have: you **can** centralize client brands, define deck/report templates, use the email app from one place, and track campaigns as initiatives. You **can’t** yet spin up a landing page. Adding that one job type (and a simple “marketing” flow) is what would make ProfessorX feel like “I can actually do a lot” for a marketing agency.

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
