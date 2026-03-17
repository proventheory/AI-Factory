import { Router } from "express";
import { pending, create, list } from "../controllers/approvals.controller.js";

const router = Router();

router.get("/v1/approvals/pending", pending);
router.post("/v1/approvals", create);
router.get("/v1/approvals", list);

export default router;
