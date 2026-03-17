import { Router } from "express";
import {
  listTaxonomyWebsites,
  listWebsiteVocabularies,
  listVocabularyTerms,
} from "../controllers/taxonomy.controller.js";

const router = Router();

router.get("/v1/taxonomy/websites", listTaxonomyWebsites);
router.get("/v1/taxonomy/websites/:id/vocabularies", listWebsiteVocabularies);
router.get("/v1/taxonomy/vocabularies/:id/terms", listVocabularyTerms);

export default router;
