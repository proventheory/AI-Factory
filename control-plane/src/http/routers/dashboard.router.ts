import { Router } from "express";
import {
  dashboard,
  search,
  systemState,
  dashboardDrift,
  renderStatus,
  analytics,
} from "../controllers/dashboard.controller.js";

const router = Router();

router.get("/v1/dashboard", dashboard);
router.get("/v1/search", search);
router.get("/v1/system_state", systemState);
router.get("/v1/dashboard/drift", dashboardDrift);
router.get("/v1/render/status", renderStatus);
router.get("/v1/analytics", analytics);

export default router;
