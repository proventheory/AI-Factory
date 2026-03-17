import { Router } from "express";
import {
  schemaDriftGet,
  schemaDriftCapture,
  contractBreakageScan,
  schemaContractsGet,
  migrationGuardPost,
} from "../controllers/schema.controller.js";

const router = Router();

router.get("/v1/schema_drift", schemaDriftGet);
router.post("/v1/schema_drift/capture", schemaDriftCapture);
router.get("/v1/contract_breakage_scan", contractBreakageScan);
router.get("/v1/schema_contracts", schemaContractsGet);
router.post("/v1/migration_guard", migrationGuardPost);

export default router;
