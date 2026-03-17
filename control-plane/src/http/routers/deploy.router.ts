import { Router } from "express";
import {
  createDeployEvent,
  getRepairPlan,
  listDeployEvents,
  syncDeployEvents,
  syncDeployEventsGithub,
  vercelRegister,
  deployFailureScan,
} from "../controllers/deploy.controller.js";

const router = Router();

router.post("/v1/deploy_events", createDeployEvent);
router.get("/v1/deploy_events/:id/repair_plan", getRepairPlan);
router.get("/v1/deploy_events", listDeployEvents);
router.post("/v1/deploy_events/sync", syncDeployEvents);
router.post("/v1/deploy_events/sync_github", syncDeployEventsGithub);
router.post("/v1/vercel/register", vercelRegister);
router.post("/v1/self_heal/deploy_failure_scan", deployFailureScan);

export default router;
