import { Router } from "express";
import {
  health,
  healthDb,
  healthMigrations,
  healthSchema,
  v1Health,
  ingestClientError,
} from "../controllers/health.controller.js";

const router = Router();

router.get("/health", health);
router.get("/health/db", healthDb);
router.get("/health/migrations", healthMigrations);
router.get("/health/schema", healthSchema);
router.get("/v1/health", v1Health);
router.post("/v1/errors", ingestClientError);

export default router;
