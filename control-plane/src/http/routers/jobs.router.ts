import { Router } from "express";
import { jobFailures, jobRunRetry, jobRunsList, jobRunLlmCalls } from "../controllers/jobs.controller.js";

const router = Router();

router.post("/v1/job_failures", jobFailures);
router.post("/v1/job_runs/:id/retry", jobRunRetry);
router.get("/v1/job_runs", jobRunsList);
router.get("/v1/job_runs/:id/llm_calls", jobRunLlmCalls);

export default router;
