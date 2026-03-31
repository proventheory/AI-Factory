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
} from "../controllers/seo.controller.js";
import {
  wpShopifyMigrationSyncGoalMetadata,
  wpShopifyMigrationCrawl,
  wpShopifyMigrationCrawlExecute,
  wpShopifyMigrationDryRun,
  wpShopifyMigrationPreviewItems,
  wpShopifyMigrationRun,
  wpShopifyMigrationMigratePdfs,
  wpShopifyMigrationResolvePdfUrls,
  wpShopifyMigrationWizardJob,
} from "../controllers/wp-shopify-migration.controller.js";

const router = Router();

router.post("/v1/sitemap/products", sitemapProducts);
router.post("/v1/wp-shopify-migration/sync_goal_metadata", wpShopifyMigrationSyncGoalMetadata);
router.post("/v1/wp-shopify-migration/crawl", wpShopifyMigrationCrawl);
router.post("/v1/wp-shopify-migration/crawl_execute", wpShopifyMigrationCrawlExecute);
router.post("/v1/wp-shopify-migration/dry_run", wpShopifyMigrationDryRun);
router.post("/v1/wp-shopify-migration/preview_items", wpShopifyMigrationPreviewItems);
router.post("/v1/wp-shopify-migration/run", wpShopifyMigrationRun);
router.post("/v1/wp-shopify-migration/migrate_pdfs", wpShopifyMigrationMigratePdfs);
router.post("/v1/wp-shopify-migration/resolve_pdf_urls", wpShopifyMigrationResolvePdfUrls);
router.post("/v1/wp-shopify-migration/wizard_job", wpShopifyMigrationWizardJob);
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
