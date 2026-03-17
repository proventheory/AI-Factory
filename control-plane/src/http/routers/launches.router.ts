import { Router } from "express";
import {
  buildSpecsList,
  buildSpecsGetById,
  buildSpecsPost,
  buildSpecsFromStrategy,
  launchesList,
  launchesGetById,
  launchesActions,
  launchesValidate,
} from "../controllers/launches.controller.js";

const router = Router();

router.get("/v1/build_specs", buildSpecsList);
router.post("/v1/build_specs/from_strategy", buildSpecsFromStrategy);
router.get("/v1/build_specs/:id", buildSpecsGetById);
router.post("/v1/build_specs", buildSpecsPost);

router.get("/v1/launches", launchesList);
router.post("/v1/launches/actions/:action", launchesActions);
router.get("/v1/launches/:id", launchesGetById);
router.post("/v1/launches/:id/validate", launchesValidate);

export default router;
