import { Router } from "express";
import { list, getById, rollout, canary } from "../controllers/releases.controller.js";

const router = Router();

router.get("/v1/releases", list);
router.get("/v1/releases/:id", getById);
router.post("/v1/releases/:id/rollout", rollout);
router.post("/v1/releases/:id/canary", canary);

export default router;
