# Notion PT Project Manager Agent — Integration with AI Factory

The **Notion PT Project Manager Agent** repo (`/Users/miguellozano/Documents/Notion PT Project Manager Agent`) is a Python system for managing **projects**, **tasks**, and **ideas** in Notion (Fortune 500–style templates, AI task classification, content generation). This doc describes where it fits with the AI Factory and how to integrate.

## Mapping to AI Factory concepts

| Notion PT | AI Factory | Notes |
|-----------|------------|--------|
| **Project** | **Initiative** | High-level goal; has status, dates, client. Initiative has intent_type, title, risk_level. |
| **Task** | **Plan node** / **Job run** | A task in Notion ≈ a step in a plan (plan_nodes) or a single job execution (job_runs). |
| **Idea** | **Initiative** (draft) | Ideas that become projects map to initiatives (e.g. status “evaluating” → low-risk initiative). |
| **Client** | Optional org/tenant | ClientManager in Notion PT; AI Factory can have org_id or environment. |

## Where it fits

1. **Planning and task management**  
   - **Before a run:** Initiatives in the Console can be backed by or synced from Notion projects. “Create initiative” could optionally create a Notion project (via Notion PT’s `ProjectManager.create_project`).  
   - **After a plan is generated:** Plan nodes (steps in the DAG) can be pushed to Notion as tasks (via `TaskManager.create_task`), so planning and execution live in both the Factory and Notion.

2. **Project management UX**  
   - Notion PT provides rich project/task UX (templates, status, assignees, due dates). The Factory provides orchestration (runs, job_runs, tool_calls, artifacts).  
   - Use Notion as the “project management” front-end for humans and the Factory as the “execution and audit” system.

3. **Adapters**  
   - Implement a **Notion adapter** in the Work Plane that:  
     - On “create initiative from Notion project”: calls Notion PT (or Notion API) to create/update a project and optionally creates an `initiatives` row linked by external_id.  
     - On “sync plan to Notion”: for each plan_node, creates or updates a Notion task (via Notion PT) and stores the Notion task id in metadata or an `external_refs` artifact.

## Suggested integration architecture

```
Console (AI Factory)                Notion PT Project Manager Agent
────────────────────                ────────────────────────────────
Initiatives list                    Projects DB (Notion)
  └─ "Create from Notion"  ──────► ProjectManager.create_project()
  └─ external_id: notion_project_id

Plans / plan_nodes                  Tasks DB (Notion)
  └─ "Sync to Notion"       ──────► TaskManager.create_task() per node
  └─ Link plan_node_id ↔ notion_task_id (in artifact or metadata)

Runs / job_runs                     (Optional) Update Notion task status
  └─ On job success/fail   ──────► TaskManager.update_task_status()
```

## Implementation options

1. **Sidecar service**  
   A small service (Node or Python) that:  
   - Subscribes to Control Plane events (e.g. initiative created, plan created) or exposes HTTP endpoints.  
   - Calls the Notion PT scripts or imports `ProjectManager` / `TaskManager` and uses the same Notion credentials.  
   - Writes back external refs (Notion IDs) into the Factory (e.g. initiatives table metadata column or artifacts).

2. **Adapter in the Work Plane**  
   - New adapter capability, e.g. `notion:project:create`, `notion:task:create`, `notion:task:update`.  
   - Runner executes these via a Notion PT client (or shell out to `create_project.py`).  
   - tool_calls store request/response; artifacts can store Notion page IDs.

3. **Console-only**  
   - “Sync to Notion” and “Create project in Notion” buttons in the Console that call an API (your sidecar or a serverless function) that uses Notion PT to create/update projects and tasks.

## What to reuse from Notion PT

- **Project and task schemas** — Already defined (SCHEMA.md, projects/project_template.json).  
- **Task classification** — `TaskClassifier` (AI + rules) can classify plan_node job_type or description.  
- **Templates** — `ProjectTemplateBuilder`, `TaskTemplateBuilder` for consistent structure in Notion.  
- **Idempotency** — Notion PT’s External ID (e.g. `client_slug_project_slug_task_slug`) aligns with Factory’s idempotency; use a shared convention (e.g. `factory_initiative_<id>_plan_<id>_node_<key>`).

## Next steps

- Add optional `external_refs` or `notion_project_id` / `notion_task_id` to initiatives or plan_nodes if you want DB-level linkage.  
- Implement one of the integration options above (sidecar, adapter, or Console API).  
- Configure Notion API keys and database IDs (env or Control Plane secrets) for the environment that runs the integration.
