import { Router } from "express";
import { listCatalogProducts, upsertCatalogProduct } from "../controllers/catalog.controller.js";

const router = Router();

router.get("/v1/catalog/products", listCatalogProducts);
router.post("/v1/catalog/products", upsertCatalogProduct);

export default router;
