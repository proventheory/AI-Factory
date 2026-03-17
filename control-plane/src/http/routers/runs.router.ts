import { Router } from "express";
import {
  list,
  getById,
  getArtifacts,
  getStatus,
  getLogEntries,
  ingestLogs,
  imageAssignment,
  validateImageAssignment,
  cancel,
  createStub,
  byArtifactType,
  rerun,
  rollback,
} from "../controllers/runs.controller.js";

const router = Router();

router.get("/v1/runs", list);
router.get("/v1/runs/:id", getById);
router.get("/v1/runs/:id/artifacts", getArtifacts);
router.get("/v1/runs/:id/status", getStatus);
router.get("/v1/runs/:id/log_entries", getLogEntries);
router.post("/v1/runs/:id/ingest_logs", ingestLogs);
router.post("/v1/runs/:id/image_assignment", imageAssignment);
router.post("/v1/runs/:id/validate_image_assignment", validateImageAssignment);
router.post("/v1/runs/:id/cancel", cancel);
router.post("/v1/runs", createStub);
router.post("/v1/runs/by-artifact-type", byArtifactType);
router.post("/v1/runs/:id/rerun", rerun);
router.post("/v1/runs/:id/rollback", rollback);

export default router;
