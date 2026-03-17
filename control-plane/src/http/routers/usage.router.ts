import { Router } from "express";
import {
  usage,
  usageByJobType,
  usageByModel,
  policies,
  adapters,
  capabilityGrants,
  secretRefs,
  audit,
} from "../controllers/usage.controller.js";

const router = Router();

router.get("/v1/usage", usage);
router.get("/v1/usage/by_job_type", usageByJobType);
router.get("/v1/usage/by_model", usageByModel);
router.get("/v1/policies", policies);
router.get("/v1/adapters", adapters);
router.get("/v1/capability_grants", capabilityGrants);
router.get("/v1/secret_refs", secretRefs);
router.get("/v1/audit", audit);

export default router;
