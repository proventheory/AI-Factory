import { Router } from "express";
import { list, getById, start } from "../controllers/plans.controller.js";

const router = Router();

router.get("/v1/plans", list);
router.get("/v1/plans/:id", getById);
router.post("/v1/plans/:id/start", start);

export default router;
