const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(s: string): boolean {
  return UUID_REGEX.test(s);
}

/** Build a placeholder map from a brand profile row for substituting [key] in MJML and {{key}} in HTML (e.g. landing footer). */
export function brandPlaceholderMap(brandRow: Record<string, unknown>): Record<string, string> {
  const name = typeof brandRow.name === "string" ? brandRow.name : "Brand";
  const identity = (brandRow.identity as Record<string, unknown>) ?? {};
  const design_tokens = (brandRow.design_tokens as Record<string, unknown>) ?? {};
  const website = typeof identity.website === "string" ? identity.website : "https://example.com";
  const baseUrl = website.replace(/\/$/, "");
  const contactEmail = typeof identity.contact_email === "string" ? identity.contact_email : "";
  const tagline = typeof identity.tagline === "string" ? identity.tagline : "";
  let logo = "";
  if (design_tokens.logo && typeof (design_tokens.logo as Record<string, unknown>).url === "string") {
    logo = (design_tokens.logo as Record<string, unknown>).url as string;
  } else if (typeof design_tokens.logo_url === "string") {
    logo = design_tokens.logo_url;
  }
  let brandColor = "#16a34a";
  const colors = (design_tokens.colors as Record<string, unknown>) ?? (design_tokens.color as Record<string, unknown>);
  const brand = colors?.brand as Record<string, unknown> | undefined;
  if (brand && typeof brand["500"] === "string") brandColor = brand["500"] as string;
  const ctaText = typeof design_tokens.cta_text === "string" ? design_tokens.cta_text : "Learn more";
  const ctaLink = typeof design_tokens.cta_link === "string" ? design_tokens.cta_link : website;
  const contactInfo = typeof design_tokens.contact_info === "string" ? design_tokens.contact_info : contactEmail;
  const year = String(new Date().getFullYear());

  const socialMedia = Array.isArray(design_tokens.social_media) ? design_tokens.social_media as Array<{ name?: string; url?: string }> : [];
  const socialByKey: Record<string, string> = {};
  for (const s of socialMedia) {
    const n = (s.name ?? "").toLowerCase();
    const u = typeof s.url === "string" ? s.url : "";
    if (n.includes("instagram")) socialByKey.instagramUrl = u;
    else if (n.includes("tiktok")) socialByKey.tiktokUrl = u;
    else if (n.includes("twitter") || n === "x") socialByKey.twitterUrl = u;
    else if (n.includes("facebook")) socialByKey.facebookUrl = u;
    else if (n.includes("youtube")) socialByKey.youtubeUrl = u;
  }
  if (!socialByKey.instagramUrl) socialByKey.instagramUrl = website;
  if (!socialByKey.tiktokUrl) socialByKey.tiktokUrl = website;
  if (!socialByKey.twitterUrl) socialByKey.twitterUrl = website;
  if (!socialByKey.facebookUrl) socialByKey.facebookUrl = website;
  if (!socialByKey.youtubeUrl) socialByKey.youtubeUrl = website;

  const disclaimerText = typeof identity.disclaimer_text === "string" ? identity.disclaimer_text : "By signing up you agree to our";

  const footerUrls = design_tokens.footer_urls && typeof design_tokens.footer_urls === "object"
    ? (design_tokens.footer_urls as Record<string, string>)
    : {};
  const gradientsList = Array.isArray(design_tokens.gradients) ? design_tokens.gradients : [];
  const gradientCssList: string[] = [];
  for (const g of gradientsList) {
    if (g && typeof g === "object" && (g as Record<string, unknown>).type === "linear" && Array.isArray((g as Record<string, unknown>).stops)) {
      const stops = ((g as Record<string, unknown>).stops as string[]).filter((s) => typeof s === "string" && (s as string).trim());
      if (stops.length >= 2)
        gradientCssList.push(`linear-gradient(135deg, ${stops.join(", ")})`);
    }
  }
  const typo = design_tokens.typography as Record<string, unknown> | undefined;
  const fonts = typo?.fonts as Record<string, string> | undefined;
  const fontHeadings = typeof fonts?.heading === "string" ? fonts.heading : (typeof typo?.font_headings === "string" ? typo.font_headings : (typeof design_tokens.font_headings === "string" ? design_tokens.font_headings : ""));
  const fontBody = typeof fonts?.body === "string" ? fonts.body : (typeof typo?.font_body === "string" ? typo.font_body : (typeof design_tokens.font_body === "string" ? design_tokens.font_body : ""));
  const fontFamily = (fontHeadings || fontBody || "system-ui").includes(" ") ? `"${fontHeadings || fontBody || "system-ui"}"` : (fontHeadings || fontBody || "system-ui");
  const logoPharmacyText = typeof design_tokens.logo_pharmacy_text === "string"
    ? design_tokens.logo_pharmacy_text
    : (typeof identity.logo_pharmacy_text === "string" ? identity.logo_pharmacy_text : (name.split(/\s+/)[0] ?? "Brand"));
  const logoTimeText = typeof design_tokens.logo_time_text === "string"
    ? design_tokens.logo_time_text
    : (typeof identity.logo_time_text === "string" ? identity.logo_time_text : (name.split(/\s+/).slice(1).join(" ").trim() || ""));
  const headingHighlightColor =
    (typeof design_tokens.heading_highlight_color === "string" && design_tokens.heading_highlight_color.trim())
      ? design_tokens.heading_highlight_color.trim()
      : (brand && typeof (brand as Record<string, string>)["400"] === "string"
        ? (brand as Record<string, string>)["400"]
        : "#c2b6f8");

  const base = {
    logo: logo || "https://via.placeholder.com/120x40?text=Logo",
    siteUrl: website,
    site_url: website,
    brandName: name,
    brand_name: name,
    companyName: name,
    headline: "Premium quality you can trust",
    body: "Discover our bestsellers and limited drops. Free shipping on orders over $70.",
    cta_text: ctaText,
    cta_url: ctaLink,
    brandColor,
    brand_color: brandColor,
    headingHighlightColor,
    heading_highlight_color: headingHighlightColor,
    footerRights: `© ${year} ${name}. All rights reserved.`,
    contactInfo: contactInfo || contactEmail || "Contact us",
    "social media link": website,
    "social media icon": "https://via.placeholder.com/24",
    "image_url": "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&h=400&fit=crop",
    "product A src": "https://via.placeholder.com/280x280?text=Product+A",
    "product A title": "Featured product",
    "product A productUrl": website,
    "product B src": "https://via.placeholder.com/280x280?text=Product+B",
    "product B title": "Best seller",
    "product B productUrl": website,
    year,
    tagline: tagline || "Quality you can trust.",
    logoUrl: logo || "https://via.placeholder.com/120x40?text=Logo",
    logoPharmacyText,
    logoTimeText,
    disclaimerText,
    privacyUrl: `${baseUrl}/privacy-policy/`,
    termsUrl: `${baseUrl}/terms-conditions/`,
    hipaaUrl: `${baseUrl}/hipaa-privacy-statement/`,
    howItWorksUrl: `${baseUrl}/how-it-works/`,
    faqUrl: `${baseUrl}/faq/`,
    contactUrl: `${baseUrl}/contact-us/`,
    supportUrl: `${baseUrl}/support/`,
    emailPlaceholder: "Enter your email",
    emailSignupAction: `${baseUrl}/newsletter/`,
    legitscriptUrl: "https://legitscript.com",
    popularWeightManagementUrl: `${baseUrl}/product-category/weight-management/`,
    popularHormoneReplacementUrl: `${baseUrl}/product-category/hormone-replacement/`,
    popularIvTherapyUrl: `${baseUrl}/product-category/iv-therapy-supplements/`,
    popularSexualWellnessUrl: `${baseUrl}/product-category/sexual-wellness/`,
    popularThyroidUrl: `${baseUrl}/product-category/thyroid/`,
    popularGlp1Url: `${baseUrl}/product-category/glp-1-treatments/`,
    popularOzempicUrl: `${baseUrl}/product-category/ozempic/`,
    popularWegovyUrl: `${baseUrl}/product-category/wegovy/`,
    popularSermorelinUrl: `${baseUrl}/product-category/sermorelin/`,
    popularNadUrl: `${baseUrl}/product-category/nad-plus/`,
    fontFamily,
    ...socialByKey,
  };
  const result: Record<string, string> = { ...base };
  for (const [k, v] of Object.entries(footerUrls)) {
    if (typeof v === "string" && v.trim()) result[k] = v.trim();
  }
  gradientCssList.forEach((css, i) => {
    result[`gradient_${i}`] = css;
    if (i === 0) result.gradientContainer1 = css;
    if (i === 1) result.gradientContainer2 = css;
  });
  gradientsList.forEach((g, i) => {
    if (gradientCssList[i] && g && typeof g === "object" && typeof (g as Record<string, string>).name === "string") {
      const nameKey = String((g as Record<string, string>).name).trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "") || `gradient_${i}`;
      if (nameKey) result[`gradient_${nameKey}`] = gradientCssList[i];
    }
  });
  return result;
}

/** Substitute [placeholder] in mjml with values from map; leave unknown placeholders as-is. */
export function substitutePlaceholders(mjml: string, map: Record<string, string>): string {
  return mjml.replace(/\[([^\]]+)\]/g, (_, key: string) => {
    const k = key.trim();
    return k in map ? map[k] : `[${key}]`;
  });
}

/** Substitute {{placeholder}} in HTML (e.g. landing footer) with values from map; leave unknown as-is. */
export function substitutePlaceholdersDoubleCurly(html: string, map: Record<string, string>): string {
  return html.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const k = key.trim();
    return k in map ? map[k] : `{{${key}}}`;
  });
}
