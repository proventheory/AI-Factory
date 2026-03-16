# Runbook: Artifact and lineage debugging

When you need to see **who produced** an artifact and **who consumed** it (lineage), or debug missing/wrong artifact content.

---

## Lineage API

- **`GET /v1/graph/lineage/:artifactId`**  
  Returns:
  - **declared_producer** — plan node (and run) that produced this artifact.
  - **observed_consumers** — job runs that recorded consumption (rows in `artifact_consumption`).

Use this in debug bundles, Console (Admin → Artifacts → open artifact), or scripts.

---

## Console

- **Admin → Artifacts** — list artifacts; open one to see producer and consumers (when the UI is wired to the lineage API).

---

## Artifact content and LLM

- **Invariant:** No raw artifact body in LLM prompts. All paths that put artifact content into model context must use **`loadArtifactContentForLlm`** (`runners/src/artifact-content.ts`). Capped by chars/bytes; fallback: content → summary → stable JSON. See [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## Capability and “who can produce X”

- **`GET /v1/capability/resolve?produces=<artifact_type>`** — returns operator keys that produce that type (e.g. `copy`, `landing_page`).
- **`POST /v1/runs/by-artifact-type`** — body `{ produces: "copy" }` — resolve → create run → runner produces artifact. Full loop for “I need this artifact type.”

See [CAPABILITY_GRAPH.md](../CAPABILITY_GRAPH.md), [WHAT_YOU_CAN_DO_WITH_PROFESSORX.md](../WHAT_YOU_CAN_DO_WITH_PROFESSORX.md) (§2b).

---

See also: [OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md), [large-deploy-verification.md](large-deploy-verification.md).
