import { Router } from "express";
import {
  documentTemplatesList,
  documentTemplatesGetById,
  documentTemplatesPost,
  documentTemplatesPut,
  documentTemplatesDelete,
  documentTemplatesComponentsPost,
  documentTemplatesComponentsPut,
  documentTemplatesComponentsDelete,
  pexelsSearch,
  campaignImagesCopy,
} from "../controllers/templates.controller.js";

const router = Router();

router.get("/v1/document_templates", documentTemplatesList);
router.get("/v1/document_templates/:id", documentTemplatesGetById);
router.post("/v1/document_templates", documentTemplatesPost);
router.put("/v1/document_templates/:id", documentTemplatesPut);
router.delete("/v1/document_templates/:id", documentTemplatesDelete);
router.post("/v1/document_templates/:id/components", documentTemplatesComponentsPost);
router.put("/v1/document_templates/:id/components/:cid", documentTemplatesComponentsPut);
router.delete("/v1/document_templates/:id/components/:cid", documentTemplatesComponentsDelete);
router.get("/v1/pexels/search", pexelsSearch);
router.post("/v1/campaign-images/copy", campaignImagesCopy);

export default router;
