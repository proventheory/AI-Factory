-- Contract for "introducing emma" template: 1 hero/content image, 5 product slots.
-- Ensures the template picker shows "1 image, 5 products". The runner uses the
-- first selected campaign image as hero; the template's hero block must use
-- [image 1] or [hero] (not a product placeholder) so that slot gets the hero image.
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
  5,
  true,
  true,
  now()
FROM email_templates t
WHERE TRIM(t.name) ILIKE '%introducing emma%'
ON CONFLICT (template_id, version)
DO UPDATE SET
  max_content_slots = EXCLUDED.max_content_slots,
  max_product_slots = EXCLUDED.max_product_slots,
  product_hero_allowed = EXCLUDED.product_hero_allowed,
  supports_content_images = EXCLUDED.supports_content_images,
  supports_product_images = EXCLUDED.supports_product_images,
  updated_at = now();
