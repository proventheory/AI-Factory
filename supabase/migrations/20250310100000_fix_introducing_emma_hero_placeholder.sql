-- Fix "Introducing Emma" (and similar) templates: hero section must use campaign hero, not product image.
-- If the template mistakenly uses {{product_1_image}} in the hero (first visual block), replace
-- only the first occurrence with {{hero_image_url}} so the selected campaign image appears in the hero.
-- Product blocks further down keep {{product_1_image}} and still show product 1.
UPDATE email_templates
SET mjml = regexp_replace(mjml, '\{\{\s*product_1_image\s*\}\}', '{{hero_image_url}}', '1')
WHERE name ILIKE '%introducing emma%'
  AND mjml ~ '\{\{\s*product_1_image\s*\}\}';

-- If template uses [product A image] in bracket form (replaced later by runner), we cannot fix via SQL
-- without parsing MJML; the runner already maps [hero] and [image 1] to hero. Document in TEMPLATE_IMAGE_QA_CHECKLIST.
