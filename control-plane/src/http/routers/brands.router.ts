import { Router } from "express";
import {
  listBrandProfiles,
  getBrandProfile,
  getBrandProfileUsage,
  prefillBrandFromUrl,
  createBrandProfile,
  updateBrandProfile,
  deleteBrandProfile,
  listOrganizations,
  listStores,
  listBrandEmbeddings,
  createBrandEmbedding,
  searchBrandEmbeddings,
  deleteBrandEmbedding,
  listBrandAssets,
  createBrandAsset,
  deleteBrandAsset,
} from "../controllers/brands.controller.js";
import {
  brandProfilesGoogleConnected,
  brandProfilesGoogleGa4Properties,
  brandProfilesGoogleGa4PropertyPatch,
  brandProfilesGoogleCredentialsDelete,
  brandProfilesShopifyConnected,
  brandProfilesShopifyCredentialsPut,
  brandProfilesShopifyCredentialsDelete,
  brandProfilesWooCommerceConnected,
  brandProfilesWooCommerceCredentialsPut,
  brandProfilesWooCommerceCredentialsDelete,
} from "../controllers/seo.controller.js";

const router = Router();

router.get("/v1/brand_profiles", listBrandProfiles);
router.get("/v1/brand_profiles/:id/usage", getBrandProfileUsage);
router.get("/v1/brand_profiles/:id/embeddings", listBrandEmbeddings);
router.get("/v1/brand_profiles/:id/assets", listBrandAssets);
router.get("/v1/brand_profiles/:id/google_connected", brandProfilesGoogleConnected);
router.get("/v1/brand_profiles/:id/google_ga4_properties", brandProfilesGoogleGa4Properties);
router.patch("/v1/brand_profiles/:id/google_ga4_property", brandProfilesGoogleGa4PropertyPatch);
router.delete("/v1/brand_profiles/:id/google_credentials", brandProfilesGoogleCredentialsDelete);
router.get("/v1/brand_profiles/:id/shopify_connected", brandProfilesShopifyConnected);
router.put("/v1/brand_profiles/:id/shopify_credentials", brandProfilesShopifyCredentialsPut);
router.delete("/v1/brand_profiles/:id/shopify_credentials", brandProfilesShopifyCredentialsDelete);
router.get("/v1/brand_profiles/:id/woocommerce_connected", brandProfilesWooCommerceConnected);
router.put("/v1/brand_profiles/:id/woocommerce_credentials", brandProfilesWooCommerceCredentialsPut);
router.delete("/v1/brand_profiles/:id/woocommerce_credentials", brandProfilesWooCommerceCredentialsDelete);
router.get("/v1/brand_profiles/:id", getBrandProfile);
router.post("/v1/brand_profiles/prefill_from_url", prefillBrandFromUrl);
router.post("/v1/brand_profiles", createBrandProfile);
router.post("/v1/brand_profiles/:id/embeddings/search", searchBrandEmbeddings);
router.post("/v1/brand_profiles/:id/embeddings", createBrandEmbedding);
router.post("/v1/brand_profiles/:id/assets", createBrandAsset);
router.put("/v1/brand_profiles/:id", updateBrandProfile);
router.delete("/v1/brand_profiles/:id/embeddings/:eid", deleteBrandEmbedding);
router.delete("/v1/brand_profiles/:id/assets/:aid", deleteBrandAsset);
router.delete("/v1/brand_profiles/:id", deleteBrandProfile);

router.get("/v1/organizations", listOrganizations);
router.get("/v1/stores", listStores);

export default router;
