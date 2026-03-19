# How far are we from the traversable vision?

**Vision (from your screens):**  
*5 graphs, 3K+ nodes/edges, platform traversable • “Ask it anything or do anything” • Graph = what must exist, operators = how to produce it, runtime = resolves the rest • Deterministic AI pushing buttons • Saved graph operators = forever flow • Universal artifact compiler / Swiss Army knife.*

---

## Already there (backend + surface)

| Vision piece | AI Factory today |
|--------------|------------------|
| **5 graphs** | **Live.** `dependency`, `topology`, `strategy`, `governance`, `catalog`. `GET /v1/graphs/:name`, `GET /v1/graphs/summary`, `POST /v1/graphs/query`. |
| **“X nodes, Y edges”** | **Live.** `GET /v1/graphs/summary` returns `total_nodes`, `total_edges` and per-graph counts. Numbers come from your data. |
| **Ask → graph answer** | **Live.** `POST /v1/ask` with `raw_text`. Intent resolver maps “blocked tasks”, “blast radius”, “topology”, “governance”, “catalog”, “active runs” to graph queries and returns `answer` + `graph_result`. |
| **Graph-backed answers** | **Live.** Governance: “N policies, M action policies, K approval policies”. Topology: “N environments, M releases”. Strategy: blocked/running nodes. Dependency: blast radius / upstream. Catalog: operators, flows. |
| **Operators + runtime** | **Live.** Capability graph, plan compiler, runs, job_claims, artifact consumption. `POST /v1/operators/:id/execute`; flow run by name. |
| **Deterministic execution** | **Live.** Scheduler, reaper, repair engine, self-heal, deploy-failure scan. No “random tools”; graph + operators + runtime. |

So: **graph (what must exist), operators (how to produce it), runtime (resolves the rest)** is the architecture you have. The “universal artifact compiler” / “Swiss Army knife” is the same idea; the engine is in place.

---

## Gaps (mostly product surface and one layer)

1. **Console “ask” + banner**
   - **Backend:** `POST /v1/ask`, `GET /v1/graphs/summary` exist.
   - **Gap:** No ProfessorX UI that shows “5 graphs, X nodes, Y edges” or a single “Ask anything” input that calls `/v1/ask` and displays the answer + graph result.
   - **To get there:** Add a dashboard widget or dedicated “Ask” page that calls `GET /v1/graphs/summary` for the banner and `POST /v1/ask` with the user’s text, then render `answer` and optional graph summary/nodes.

2. **Richer answer phrasing**
   - Screenshot-style answers: “6 accounts, 44 resources at risk”, “Cloudflare (50), then Drupal (13)…”
   - **Today:** Governance/topology/strategy already return human-readable `answer`; dependency/catalog may be more “N nodes, M edges” or similar.
   - **Gap:** Optional preset or formatter that turns dependency/catalog results into “X accounts at risk”, “biggest blast radius: Provider (count), …” when the data supports it.

3. **“Do anything” → one-click execute**
   - **Today:** Actions like “rerun run”, “replay subgraph”, “deploy staging” resolve to `resolved_endpoint` + `resolved_params` but are **not** auto-executed; they’re proposed for approval/caller.
   - **Gap:** Policy + UX: either auto-execute for low-risk actions or add “Execute” in the Console when the ask response is an action.

4. **Saved operators / “Forever flow”**
   - **Today:** Operators by ID, flow run by name; runtime resolves and runs.
   - **Gap:** “Save this as an operator, boom, forever flow” is a **UX/product** feature: a way in the UI to name and save a flow (or graph traversal + steps) and then “ask to do X” → “run saved flow X.” Backend can support it with saved_flows / catalog; the Builder Studio “build pipeline from prompt” + “save as reusable operator” is the missing surface.

5. **Canonical graph registry**
   - **Today:** Five projections built from existing tables (plans, artifact_consumption, policies, etc.); no single `graph_nodes` / `graph_edges` identity layer.
   - **Gap:** One substrate so all five are views (see `.cursor/plans/ai_factory_os_traversable_graph_plan.md`). Improves dedupe, unified queries, and “one navigable graph”; not required for “ask anything” or the banner.

6. **Intent compiler (NL → BuildSpec)**
   - **Today:** Intent resolver maps phrases to graph_query or action; it’s keyword/phrase-based.
   - **Gap:** “Launch landing page + email + SEO” → typed BuildSpec/ExecutionPlan (LLM or rules emit intent; runtime executes). That’s the next step for “ask to do anything” with complex, multi-step intents.

---

## Short answer

- **How far?** The **core is there:** 5 graphs, ask → graph answer, operators, deterministic runtime. You’re most of the way to “platform is traversable” and “ask anything / do anything” at the **API** level.
- **What’s left:** (1) Console UI for “Ask” + “5 graphs, X nodes, Y edges” banner, (2) optional richer answer phrasing for dependency/catalog, (3) “do anything” execute path (policy + one-click in UI), (4) saved “forever” flow as a first-class product surface, (5) canonical graph registry and (6) NL → BuildSpec intent compiler for later.

**References:** `docs/TRAVERSABLE_GRAPH_STATUS.md`, `control-plane/src/graphs/`, `.cursor/plans/ai_factory_os_traversable_graph_plan.md`.

---

## Implemented (this pass)

| Gap | Implementation |
|-----|----------------|
| **Console “ask” + banner** | **Ask page:** `console/app/graph/ask/page.tsx` — banner from `GET /v1/graphs/summary`, input for raw text, `POST /v1/ask`, display `answer_text` / `graph_result`. **Dashboard banner:** `console/app/dashboard/page.tsx` — same summary line + link to Ask. |
| **Richer answer phrasing** | **Dependency:** `control-plane/src/graphs/dependency-graph.ts` — query() now sets `answer` from node_counts_by_kind (e.g. "N artifacts, M runs; blast radius: K nodes"). **Catalog:** `control-plane/src/graphs/catalog-graph.ts` — query() sets `answer` (e.g. "X operators, Y saved flows, Z brands in catalog."). |
| **“Do anything” → Execute** | **Backend:** `POST /v1/ask/execute` in `control-plane/src/graphs/graph-endpoints.ts` — body: `intent_document_id`, optional `run_id`; executes deploy_failure_scan or rerun. **Console:** Ask page shows "Execute" when response is an action; optional run_id input for rerun. |
| **Saved flows UX** | **Console:** `console/app/flows/page.tsx` — list flows (GET /v1/flows), create flow (POST /v1/flows), run flow (form: initiative_id, idempotency_key, environment → POST /v1/flows/:id/run). **Nav:** "Ask anything" and "Saved flows" under GRAPH & SELF-HEAL. |
| **Canonical graph registry** | **Doc only:** `docs/CANONICAL_GRAPH_REGISTRY.md` — describes current state, goal, and references; no schema change. |
| **Intent compiler (NL → BuildSpec)** | Deferred; doc already listed it as “later.” |
