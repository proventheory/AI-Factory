import { Router } from "express";
import {
  sitemapProducts,
  productsFromUrlHandler,
  seoGscReport,
  seoGa4Report,
  seoGoogleAuth,
  seoGoogleCallback,
  brandProfilesGoogleConnected,
  brandProfilesGoogleCredentialsDelete,
  brandProfilesGoogleGa4Properties,
  brandProfilesGoogleGa4PropertyPatch,
  seoMigrationCrawl,
} from "../controllers/seo.controller.js";

const router = Router();

router.post("/v1/sitemap/products", sitemapProducts);
router.post("/v1/seo/migration/crawl", seoMigrationCrawl);
router.post("/v1/products/from_url", productsFromUrlHandler);
router.post("/v1/seo/gsc_report", seoGscReport);
router.post("/v1/seo/ga4_report", seoGa4Report);
router.get("/v1/seo/google/auth", seoGoogleAuth);
router.get("/v1/seo/google/callback", seoGoogleCallback);
router.get("/v1/seo/google_ga4_properties", brandProfilesGoogleGa4Properties);
router.get("/v1/brand_profiles/:id/google_connected", brandProfilesGoogleConnected);
router.get("/v1/brand_profiles/:id/google_ga4_properties", brandProfilesGoogleGa4Properties);
router.patch("/v1/brand_profiles/:id/google_ga4_property", brandProfilesGoogleGa4PropertyPatch);
router.delete("/v1/brand_profiles/:id/google_credentials", brandProfilesGoogleCredentialsDelete);

export default router;
