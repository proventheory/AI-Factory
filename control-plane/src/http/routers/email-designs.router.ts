import { Router } from "express";
import { list, getById, post, patch } from "../controllers/email-designs.controller.js";

const router = Router();

router.get("/v1/email_designs", list);
router.get("/v1/email_designs/:id", getById);
router.post("/v1/email_designs", post);
router.patch("/v1/email_designs/:id", patch);

export default router;
