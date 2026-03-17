import { Router } from "express";
import {
  graphTopology,
  graphFrontier,
  graphRepairPlan,
  graphSubgraphReplay,
  graphAudit,
  graphMissingCapabilities,
  graphLineage,
} from "../controllers/graph-legacy.controller.js";

const router = Router();

router.get("/v1/graph/topology/:planId", graphTopology);
router.get("/v1/graph/frontier/:runId", graphFrontier);
router.get("/v1/graph/repair_plan/:runId/:nodeId", graphRepairPlan);
router.post("/v1/graph/subgraph_replay", graphSubgraphReplay);
router.get("/v1/graph/audit/:runId", graphAudit);
router.get("/v1/graph/missing_capabilities/:planId", graphMissingCapabilities);
router.get("/v1/graph/lineage/:artifactId", graphLineage);

export default router;
