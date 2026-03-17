import { Router } from "express";
import {
  webhookOutboxList,
  webhookOutboxPatch,
  webhooksGithub,
  webhooksVercel,
} from "../controllers/webhooks.controller.js";

const router = Router();

router.get("/v1/webhook_outbox", webhookOutboxList);
router.patch("/v1/webhook_outbox/:id", webhookOutboxPatch);
router.post("/v1/webhooks/github", webhooksGithub);
router.post("/v1/webhooks/vercel", webhooksVercel);

export default router;
