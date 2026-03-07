# Template image QA checklist

Use one section per template. Contract and placeholder rules: see [EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md](EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md).

---

## Universal QA sheet (copy per template)

- [ ] Contract row exists in template_image_contracts
- [ ] hero_required set correctly
- [ ] logo_safe_hero set correctly
- [ ] product_hero_allowed set correctly
- [ ] max_content_slots matches actual template
- [ ] max_product_slots matches actual template
- [ ] Hero block uses [hero] / canonical hero variable
- [ ] Hero block does not use [image 1]
- [ ] Hero block does not use product image placeholder unless allowed
- [ ] Editorial blocks use [image n]
- [ ] Product blocks use [product image n]
- [ ] Empty optional blocks collapse cleanly
- [ ] No unsupported placeholder aliases
- [ ] No unresolved placeholders in proof run
- [ ] No logo-stretch issue in fallback mode
- [ ] No accidental hero duplication in gallery
- [ ] Proof run passes with campaign images present
- [ ] Proof run passes/fails as expected with no campaign images
- [ ] Proof run passes/fails as expected with no product images

---

## 1. 12 reasons to say bye to boring soda

**Archetype:** editorial / list-heavy / hero-led  

**Recommended contract:** hero_required=true, logo_safe_hero=false, product_hero_allowed=false, supports_content_images=true, supports_product_images=maybe, mixed_content_and_product_pool=true only if product sections exist.

**Checks:** Hero uses [hero] or {{hero_image_url}}; numbered editorial blocks use [image 1], [image 2], …; if product callouts exist, use [product image n] in those modules only; list modules look good when content images collapse; hero is not pulling from product pool.

---

## 2. introducing emma

**Archetype:** contained hero + intro/story  

**Contract (migration 20250309100000):** max_content_slots=1, max_product_slots=5, product_hero_allowed=false. Ensures picker shows "1 image, 5 products" and wizard asks for 1 image and 5 products.

**Recommended contract:** hero_required=true, logo_safe_hero=true if intro can tolerate contained logo fallback, product_hero_allowed=false, supports_content_images=true, supports_product_images=true.

**Checks:** Hero block must use **[image 1]** or **[hero]** (not a product placeholder) so the selected hero image is used; the runner puts the first selected campaign image in `campaign_images[0]` and as `image_1`. Story sections use content image placeholders only; product blocks use product_1 through product_5.

---

## 3. the beauty of consistency

**Archetype:** editorial / lifestyle / soft commerce hybrid  

**Recommended contract:** hero_required=true, logo_safe_hero=maybe, product_hero_allowed=false, supports_content_images=true, supports_product_images=true if featured products exist, mixed_content_and_product_pool=false unless intended.

**Checks:** Hero uses hero placeholder only; lifestyle blocks use [image n]; featured product block uses [product image n]; product images do not fill editorial rows unless allowed; underfilled lifestyle rows collapse (no hero duplication).

---

## 4. [Template 4 – fill name]

Identify: hero-led, product-led, or mixed. Set hero_required; inspect first image-bearing module; replace [image 1] with [hero] if in hero slot; separate content and product placeholders.

---

## 5. [Template 5 – fill name]

Verify placeholder alias set matches contract; max_content_slots; no overflow (e.g. [image 6] when only 3 slots); collapse behavior for optional gallery rows.

---

## 6. [Template 6 – fill name]

Verify product modules do not backfill from generic content pool unless intended; CTA module works with collapsed imagery; hero fallback matrix defined.

---

## 7. [Template 7 – fill name]

If minimal/announcement: hero_required=false if applicable; allow text-only success if intended; no unresolved image placeholders when no images selected.

---

## 8. [Template 8 – fill name]

If featured-product template: set product_hero_allowed=true and add validation exception for product hero; otherwise fail if featured product image lands in hero slot.

---

## 9. [Template 9 – fill name]

If gallery-heavy: trailing rows collapse; no hero duplication into gallery unless allowed; max_content_slots equals actual MJML usage.

---

## 10. [Template 10 – fill name]

If reorder/reminder/commerce: hero optional; product placeholders for product cards; generic campaign images do not fill product-specific modules; text-only mode supported or explicitly disallowed.
