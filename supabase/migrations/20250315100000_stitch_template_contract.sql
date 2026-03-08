-- Contract for "Stitch (1 image, 2 products)" template: 1 hero/content image, 2 product slots.
-- Ensures the template picker shows "Content images: 1, Product slots: 2".
INSERT INTO template_image_contracts (
  template_id,
  version,
  hero_required,
  logo_safe_hero,
  product_hero_allowed,
  max_content_slots,
  max_product_slots,
  supports_content_images,
  supports_product_images,
  updated_at
)
SELECT
  t.id,
  'v1',
  true,
  true,
  false,
  1,
  2,
  true,
  true,
  now()
FROM email_templates t
WHERE TRIM(t.name) ILIKE '%stitch%' AND TRIM(t.name) LIKE '%2 products%'
ON CONFLICT (template_id, version)
DO UPDATE SET
  max_content_slots = EXCLUDED.max_content_slots,
  max_product_slots = EXCLUDED.max_product_slots,
  hero_required = EXCLUDED.hero_required,
  logo_safe_hero = EXCLUDED.logo_safe_hero,
  product_hero_allowed = EXCLUDED.product_hero_allowed,
  supports_content_images = EXCLUDED.supports_content_images,
  supports_product_images = EXCLUDED.supports_product_images,
  updated_at = now();
