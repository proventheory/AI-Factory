import { Router } from "express";
import {
  listToolCalls,
  getArtifact,
  getArtifactContent,
  getArtifactAnalyze,
  patchArtifact,
  patchArtifactKnowledge,
  postArtifactReferencedBy,
  listArtifacts,
  listLlmCalls,
  listValidations,
  postTemplateProofStart,
  listTemplateProof,
  getTemplateProofBatch,
} from "../controllers/artifacts.controller.js";

const router = Router();

router.get("/v1/tool_calls", listToolCalls);
router.get("/v1/artifacts", listArtifacts);
router.get("/v1/artifacts/:id/content", getArtifactContent);
router.get("/v1/artifacts/:id/analyze", getArtifactAnalyze);
router.get("/v1/artifacts/:id", getArtifact);
router.patch("/v1/artifacts/:id", patchArtifact);
router.patch("/v1/artifacts/:id/knowledge", patchArtifactKnowledge);
router.post("/v1/artifacts/:id/referenced_by", postArtifactReferencedBy);
router.get("/v1/llm_calls", listLlmCalls);
router.get("/v1/validations", listValidations);
router.post("/v1/template_proof/start", postTemplateProofStart);
router.get("/v1/template_proof", listTemplateProof);
router.get("/v1/template_proof/:batchId", getTemplateProofBatch);

export default router;
