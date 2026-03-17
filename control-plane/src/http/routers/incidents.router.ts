import { Router } from "express";
import {
  incidentsList,
  incidentsBySignature,
  decisionLoopObserve,
  decisionLoopTick,
  incidentMemoryList,
  incidentMemoryPost,
} from "../controllers/incidents.controller.js";

const router = Router();

router.get("/v1/incidents", incidentsList);
router.get("/v1/incidents/:signature", incidentsBySignature);
router.get("/v1/decision_loop/observe", decisionLoopObserve);
router.post("/v1/decision_loop/tick", decisionLoopTick);
router.get("/v1/incident_memory", incidentMemoryList);
router.post("/v1/incident_memory", incidentMemoryPost);

export default router;
