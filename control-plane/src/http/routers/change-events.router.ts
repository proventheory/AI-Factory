import { Router } from "express";
import {
  changeEventsList,
  changeEventsCreate,
  changeEventsGetById,
  changeEventsImpacts,
  changeEventsImpactPost,
  changeEventsBackfillPlan,
  importGraphGet,
  importGraphPost,
} from "../controllers/change-events.controller.js";

const router = Router();

router.get("/v1/change_events", changeEventsList);
router.post("/v1/change_events", changeEventsCreate);
router.get("/v1/change_events/:id", changeEventsGetById);
router.get("/v1/change_events/:id/impacts", changeEventsImpacts);
router.post("/v1/change_events/:id/impact", changeEventsImpactPost);
router.get("/v1/change_events/:id/backfill_plan", changeEventsBackfillPlan);
router.get("/v1/import_graph", importGraphGet);
router.post("/v1/import_graph", importGraphPost);

export default router;
