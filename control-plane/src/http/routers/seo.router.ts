import { Router } from "express";
import {
  sitemapProducts,
  productsFromUrlHandler,
  seoGscReport,
  seoGa4Report,
  seoKeywordVolume,
  seoRankedKeywords,
  seoGoogleAuth,
  seoGoogleCallback,
  brandProfilesGoogleConnected,
  brandProfilesGoogleCredentialsDelete,
  brandProfilesGoogleGa4Properties,
  brandProfilesGoogleGa4PropertyPatch,
  seoMigrationCrawl,
  seoMigrationDryRun,
  seoMigrationPreviewItems,
  seoMigrationRun,
  seoMigrationMigratePdfs,
  seoMigrationResolvePdfUrls,
} from "../controllers/seo.controller.js";

const router = Router();

router.post("/v1/sitemap/products", sitemapProducts);
router.post("/v1/seo/migration/crawl", seoMigrationCrawl);
router.post("/v1/seo/migration/dry_run", seoMigrationDryRun);
router.post("/v1/seo/migration/preview_items", seoMigrationPreviewItems);
router.post("/v1/seo/migration/run", seoMigrationRun);
router.post("/v1/seo/migration/migrate_pdfs", seoMigrationMigratePdfs);
router.post("/v1/seo/migration/resolve_pdf_urls", seoMigrationResolvePdfUrls);
router.post("/v1/products/from_url", productsFromUrlHandler);
router.post("/v1/seo/gsc_report", seoGscReport);
router.post("/v1/seo/ga4_report", seoGa4Report);
router.post("/v1/seo/keyword_volume", seoKeywordVolume);
router.post("/v1/seo/ranked_keywords", seoRankedKeywords);
router.get("/v1/seo/google/auth", seoGoogleAuth);
router.get("/v1/seo/google/callback", seoGoogleCallback);
router.get("/v1/seo/google_ga4_properties", brandProfilesGoogleGa4Properties);
router.get("/v1/brand_profiles/:id/google_connected", brandProfilesGoogleConnected);
router.get("/v1/brand_profiles/:id/google_ga4_properties", brandProfilesGoogleGa4Properties);
router.patch("/v1/brand_profiles/:id/google_ga4_property", brandProfilesGoogleGa4PropertyPatch);
router.delete("/v1/brand_profiles/:id/google_credentials", brandProfilesGoogleCredentialsDelete);

export default router;
