import { Router } from "express";
import {
  checkpointsList,
  checkpointsCreate,
  checkpointsGetById,
  checkpointsDiff,
  knownGood,
  failureClusters,
} from "../controllers/checkpoints.controller.js";

const router = Router();

router.get("/v1/checkpoints", checkpointsList);
router.post("/v1/checkpoints", checkpointsCreate);
router.get("/v1/checkpoints/:id", checkpointsGetById);
router.get("/v1/checkpoints/:id/diff", checkpointsDiff);
router.get("/v1/known_good", knownGood);
router.get("/v1/failure_clusters", failureClusters);

export default router;
