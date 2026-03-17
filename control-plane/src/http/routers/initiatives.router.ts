import { Router } from "express";
import {
  list,
  getById,
  patch,
  create,
  googleAccessToken,
  googleConnected,
  deleteGoogleCredentialsHandler,
  createPlan,
  replan,
} from "../controllers/initiatives.controller.js";

const router = Router();

router.get("/v1/initiatives", list);
router.get("/v1/initiatives/:id", getById);
router.patch("/v1/initiatives/:id", patch);
router.post("/v1/initiatives", create);
router.get("/v1/initiatives/:id/google_access_token", googleAccessToken);
router.get("/v1/initiatives/:id/google_connected", googleConnected);
router.delete("/v1/initiatives/:id/google_credentials", deleteGoogleCredentialsHandler);
router.post("/v1/initiatives/:id/plan", createPlan);
router.post("/v1/initiatives/:id/replan", replan);

export default router;
