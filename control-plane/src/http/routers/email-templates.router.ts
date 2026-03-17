import { Router } from "express";
import {
  list,
  getById,
  getPreview,
  getLint,
  post,
  patch,
  del,
} from "../controllers/email-templates.controller.js";

const router = Router();

router.get("/v1/email_templates", list);
router.get("/v1/email_templates/:id/preview", getPreview);
router.get("/v1/email_templates/:id/lint", getLint);
router.get("/v1/email_templates/:id", getById);
router.post("/v1/email_templates", post);
router.patch("/v1/email_templates/:id", patch);
router.delete("/v1/email_templates/:id", del);

export default router;
