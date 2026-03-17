import { Router } from "express";
import {
  list,
  assembled,
  getById,
  post,
  patch,
  del,
} from "../controllers/email-components.controller.js";

const router = Router();

router.get("/v1/email_component_library/assembled", assembled);
router.get("/v1/email_component_library", list);
router.get("/v1/email_component_library/:id", getById);
router.post("/v1/email_component_library", post);
router.patch("/v1/email_component_library/:id", patch);
router.delete("/v1/email_component_library/:id", del);

export default router;
