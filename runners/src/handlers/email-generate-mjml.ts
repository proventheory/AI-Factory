/**
 * Email generate MJML: generate HTML email from template + products + brand (Focuz flow).
 * Ported from email-marketing-factory ai-engine mjmlJsonGen; adapted to load brand/template from Control Plane.
 */

import mjml2html from "mjml";
import Handlebars from "handlebars";
import { chat, type LLMChatOptions } from "../llm-client.js";
import { loadBrandContext, brandContextToSystemPrompt, brandContextToDesignTokens } from "../brand-context.js";
import { tokens } from "../tokens.js";

const CONTROL_PLANE_URL = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");

export interface EmailGenerateMjmlInput {
  template_id?: string;
  products?: Array<{ src?: string; title?: string; product_url?: string; description?: string }>;
  campaign_prompt?: string;
}

export async function handleEmailGenerateMjml(request: {
  run_id: string;
  job_run_id: string;
  job_type: string;
  initiative_id?: string;
  llm_source?: "gateway" | "openai_direct";
  input?: EmailGenerateMjmlInput;
  /** When set, record LLM usage to llm_calls (for AI Calls / run detail). */
  recordLlmCall?: (tier: string, modelId: string, tokensIn?: number, tokensOut?: number, latencyMs?: number) => Promise<void>;
}) {
  const runId = request.run_id ?? "";
  const jobRunId = request.job_run_id ?? "";
  // #region agent log
  console.log("[MJML] entry (H10)", { run_id: runId, job_run_id: jobRunId, initiative_id: request.initiative_id ?? "(none)", input_keys: Object.keys(request.input ?? {}), template_id: request.input?.template_id ?? "(none)" });
  // #endregion
  // Self-heal: resolve initiative_id from control-plane when missing (e.g. runner DB != control-plane DB).
  let initiativeId = request.initiative_id;
  if (!initiativeId && request.run_id) {
    try {
      const runRes = await fetch(`${CONTROL_PLANE_URL}/v1/runs/${request.run_id}`);
      if (runRes.ok) {
        const runPayload = (await runRes.json()) as { initiative_id?: string; run?: { initiative_id?: string } };
        initiativeId = runPayload.initiative_id ?? runPayload.run?.initiative_id ?? undefined;
        if (initiativeId) console.log("[MJML] initiative_id from run fallback (H2)", { run_id: runId, initiative_id: initiativeId });
      }
    } catch (_e) {
      console.log("[MJML] run fallback failed (H3)", { run_id: runId, err: String((_e as Error).message).slice(0, 60) });
    }
  }
  if (!initiativeId) console.log("[MJML] no initiative_id (H2)", { run_id: runId, job_run_id: jobRunId, input_keys: Object.keys(request.input ?? {}) });

  const brandCtx = initiativeId ? await loadBrandContext(initiativeId) : null;
  const brandPrompt = brandCtx ? brandContextToSystemPrompt(brandCtx) : "";
  const mergedTokens = brandCtx ? brandContextToDesignTokens(brandCtx, tokens as unknown as Record<string, unknown>) : tokens;
  const brandColor = (mergedTokens as Record<string, unknown>)?.color && typeof (mergedTokens as Record<string, unknown>).color === "object"
    ? ((mergedTokens as Record<string, unknown>).color as Record<string, Record<string, string>>)?.brand?.["500"] ?? "#3b82f6"
    : "#3b82f6";

  let logoUrl: string | null = null;
  if (brandCtx?.id) {
    try {
      const assetsRes = await fetch(`${CONTROL_PLANE_URL}/v1/brand_profiles/${brandCtx.id}/assets?asset_type=logo`);
      if (assetsRes.ok) {
        const assets = (await assetsRes.json()) as { items?: Array<{ uri?: string }> };
        logoUrl = assets.items?.[0]?.uri ?? null;
      }
    } catch (_e) {
      console.log("[MJML] brand assets fetch failed", { brandId: brandCtx.id, err: String((_e as Error).message).slice(0, 60) });
    }
  }
  // #region agent log
  console.log("[MJML] brand + logo (H1/H7)", { run_id: runId, job_run_id: jobRunId, hasBrandCtx: !!brandCtx, brandId: brandCtx?.id, brandName: brandCtx?.name?.slice(0, 30), hasDesignTokens: !!(brandCtx?.design_tokens && Object.keys(brandCtx.design_tokens).length > 0), brandColor, logoUrl: logoUrl ?? "(none)" });
  fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:brand+logo", message: "MJML brand + logo", data: { run_id: runId, hasBrandCtx: !!brandCtx, brandId: brandCtx?.id, hasLogo: !!logoUrl }, timestamp: Date.now(), hypothesisId: "H1" }) }).catch(() => {});
  // #endregion

  let input: EmailGenerateMjmlInput = request.input ?? {};
  let subjectLine: string | undefined = undefined;
  if (initiativeId) {
    try {
      const campRes = await fetch(`${CONTROL_PLANE_URL}/v1/email_campaigns/${initiativeId}`);
      if (campRes.ok) {
        const camp = (await campRes.json()) as { template_id?: string; subject_line?: string; metadata_json?: { template_id?: string; products?: unknown[]; campaign_prompt?: string } };
        subjectLine = camp.subject_line;
        const templateIdFromCamp = camp.template_id ?? (camp.metadata_json && typeof camp.metadata_json === "object" ? (camp.metadata_json as { template_id?: string }).template_id : undefined);
        if (templateIdFromCamp) input.template_id = input.template_id ?? templateIdFromCamp;
        if (camp.metadata_json && typeof camp.metadata_json === "object") {
          const meta = camp.metadata_json as { products?: unknown[]; campaign_prompt?: string };
          if (meta.products && !input.products?.length) input.products = meta.products as EmailGenerateMjmlInput["products"];
          if (meta.campaign_prompt) input.campaign_prompt = input.campaign_prompt ?? meta.campaign_prompt;
        }
        // #region agent log
        console.log("[MJML] campaign fetch (H3/H4)", { run_id: runId, initiative_id: initiativeId, template_id: input.template_id, productsCount: (input.products ?? []).length, campaign_promptLen: (input.campaign_prompt ?? "").length, subject_line: subjectLine?.slice(0, 50) });
        fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:campaign fetch", message: "MJML campaign fetch", data: { run_id: runId, initiative_id: initiativeId, template_id: input.template_id, productsCount: (input.products ?? []).length, hasSubjectLine: !!subjectLine }, timestamp: Date.now(), hypothesisId: "H4" }) }).catch(() => {});
        // #endregion
      }
    } catch (_e) {
      console.log("[MJML] campaign fetch failed (H3)", { run_id: runId, initiative_id: initiativeId, err: String((_e as Error).message).slice(0, 80) });
    }
    // Fallback: if campaign didn't provide template_id, try initiative row (e.g. older campaigns).
    if (!input.template_id) {
      try {
        const initRes = await fetch(`${CONTROL_PLANE_URL}/v1/initiatives/${initiativeId}`);
        if (initRes.ok) {
          const init = (await initRes.json()) as { template_id?: string };
          if (init.template_id) {
            input.template_id = init.template_id;
            console.log("[MJML] template_id from initiative fallback", { template_id: init.template_id });
          }
        }
      } catch (_e2) {
        console.log("[MJML] initiative fallback failed", { initiative_id: initiativeId, err: String((_e2 as Error).message).slice(0, 60) });
      }
    }
  }

  let templateMjml: string | null = null;
  let templateJson: Record<string, unknown> | null = null;
  let sectionsJsonMerged = false;

  if (input.template_id) {
    try {
      const res = await fetch(`${CONTROL_PLANE_URL}/v1/email_templates/${input.template_id}`);
      if (res.ok) {
        const t = (await res.json()) as { mjml?: string; template_json?: unknown; sections_json?: unknown };
        templateMjml = t.mjml ?? null;
        templateJson = (t.template_json as Record<string, unknown>) ?? null;
        if (t.sections_json != null && typeof t.sections_json === "object") {
          templateJson = { ...(templateJson ?? {}), ...(t.sections_json as Record<string, unknown>) };
          sectionsJsonMerged = true;
        }
        // #region agent log
        console.log("[MJML] template fetch ok (H6)", { run_id: runId, template_id: input.template_id, mjml_len: templateMjml?.length ?? 0, template_jsonKeys: Object.keys(templateJson ?? {}), hasSectionsJson: !!t.sections_json, sectionsJsonMerged });
        fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:template fetch", message: "MJML template fetch", data: { run_id: runId, template_id: input.template_id, mjml_len: templateMjml?.length ?? 0, hasSectionsJson: !!t.sections_json }, timestamp: Date.now(), hypothesisId: "H6" }) }).catch(() => {});
        // #endregion
      } else {
        console.log("[MJML] template fetch not ok (H5)", { run_id: runId, template_id: input.template_id, status: res.status });
      }
    } catch (_e) {
      console.log("[MJML] template fetch failed (H3/H5)", { run_id: runId, template_id: input.template_id, err: String((_e as Error).message).slice(0, 80) });
    }
  } else {
    console.log("[MJML] no template_id (H4)", { run_id: runId, input_keys: Object.keys(input), template_id: input.template_id });
  }

  const products = input.products ?? [];
  const campaignPrompt = input.campaign_prompt ?? "newsletter";

  const productList = products.map((p) => ({
    name: p.title ?? "Product",
    title: p.title ?? "Product",
    link: p.product_url ?? p.src ?? "#",
    image: p.src ?? "",
    description: p.description ?? "",
  }));

  const numberedProducts: Record<string, string> = {};
  const productObjects: Record<string, { title: string; description: string; image: string; link: string; buttonText: string }> = {};
  productList.forEach((p, i) => {
    const n = i + 1;
    numberedProducts[`product_${n}_image`] = p.image;
    numberedProducts[`product_${n}_title`] = p.title;
    numberedProducts[`product_${n}_url`] = p.link;
    numberedProducts[`product_${n}_description`] = p.description;
    productObjects[`product${n}`] = { title: p.title, description: p.description, image: p.image, link: p.link, buttonText: "Learn more" };
  });
  const imagesArray = productList.map((p) => ({ title: p.title, description: p.description, buttonText: "Learn more" }));

  const typo = mergedTokens && typeof mergedTokens === "object" ? (mergedTokens as Record<string, unknown>).typography : undefined;
  const fontFamilyObj = typo && typeof typo === "object" ? (typo as Record<string, unknown>).fontFamily : undefined;
  const fontFamily = fontFamilyObj && typeof fontFamilyObj === "object"
    ? ((fontFamilyObj as Record<string, string>).sans ?? (fontFamilyObj as Record<string, string>).body ?? "system-ui, sans-serif")
    : "system-ui, sans-serif";

  // Use preselected MJML template with brand tokens whenever we have template + fetch succeeded (products optional).
  if (templateMjml) {
    try {
      const sectionJson: Record<string, unknown> = {
        ...(templateJson ?? {}),
        products: productList,
        ...numberedProducts,
        ...productObjects,
        images: imagesArray,
        fontFamily,
        fonts: fontFamily,
        brandColor,
        color: brandColor,
        primaryColor: brandColor,
        brand_color: brandColor,
        logoUrl: logoUrl ?? "",
        logo_url: logoUrl ?? "",
        brandName: brandCtx?.name ?? "",
        brand_name: brandCtx?.name ?? "",
        tagline: (brandCtx?.identity as { tagline?: string } | undefined)?.tagline ?? "",
        voicetone: brandCtx?.tone?.voice_descriptors?.[0] ?? "friendly",
        footerRights: `© ${new Date().getFullYear()}`,
        contactInfo: (brandCtx?.identity as { contact_email?: string } | undefined)?.contact_email ?? "",
        socialMedia: [],
        campaignPrompt,
        headline: campaignPrompt,
        title: campaignPrompt,
        offerText: campaignPrompt,
        offer: campaignPrompt,
        header: campaignPrompt,
        subhead: campaignPrompt,
        body: campaignPrompt,
        message: campaignPrompt,
        description: campaignPrompt,
        prehead: campaignPrompt,
        eyebrow: campaignPrompt,
        cta_text: "Learn more",
        cta_label: "Learn more",
        cta_url: "#",
        cta_link: "#",
        footer: `© ${new Date().getFullYear()} ${brandCtx?.name ?? ""}. All rights reserved.`,
        hero_image: logoUrl ?? productList[0]?.image ?? "",
        emailTitle: subjectLine ?? campaignPrompt,
        subject_line: subjectLine ?? campaignPrompt,
      };
      // #region agent log
      const productObjectKeys = Object.keys(productObjects);
      console.log("[MJML] template payload (H6/H7)", { run_id: runId, template_id: input.template_id, sectionJsonKeys: Object.keys(sectionJson), productsCount: productList.length, productObjectKeys, imagesCount: imagesArray.length, hasLogo: !!logoUrl, logoUrlSnippet: (logoUrl ?? "").slice(0, 60), campaignPromptLen: campaignPrompt.length, sectionsJsonMerged });
      fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:sectionJson", message: "MJML sectionJson", data: { run_id: runId, sectionJsonKeys: Object.keys(sectionJson), productsCount: productList.length, hasLogo: !!logoUrl, campaignPromptLen: campaignPrompt.length }, timestamp: Date.now(), hypothesisId: "H7" }) }).catch(() => {});
      // #endregion
      const compile = Handlebars.compile(templateMjml);
      let mjmlOut = compile(sectionJson);
      // Apply brand color only in style blocks that look like headings (font-size >= 20px or font-weight bold) so body copy stays black.
      const headingLike = /font-size:\s*(?:2\d|3\d|4\d|5\d)px|font-weight:\s*bold/i;
      mjmlOut = mjmlOut.replace(/style="([^"]*)"/g, (_match, content) => {
        if (headingLike.test(content) && (/\bcolor:\s*#000000\b/.test(content) || /\bcolor:\s*#000\b/.test(content))) {
          const out = content.replace(/\bcolor:\s*#000000\b/gi, `color:${brandColor}`).replace(/\bcolor:\s*#000\b/gi, `color:${brandColor}`);
          return `style="${out}"`;
        }
        return _match;
      });
      // If no heading-like black was found, replace only the first occurrence of black text so main heading gets brand.
      if (!mjmlOut.includes(brandColor)) {
        mjmlOut = mjmlOut.replace(/\bcolor:\s*#000000\b/i, `color:${brandColor}`).replace(/\bcolor:\s*#000\b/i, `color:${brandColor}`);
      }
      // First occurrence of black background only (e.g. header bar) so we don't recolor every black block.
      let bgReplaced = false;
      mjmlOut = mjmlOut.replace(/\b(background-color:\s*)(#000000|#000)\b/gi, (full, prefix: string) => {
        if (bgReplaced) return full;
        bgReplaced = true;
        return prefix + brandColor;
      });
      const { html } = mjml2html(mjmlOut, { minify: true });
      // #region agent log
      console.log("[MJML] compile success (H9)", { run_id: runId, htmlLen: html?.length ?? 0, campaignPromptSnippet: campaignPrompt.slice(0, 40) });
      fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:compile success", message: "MJML compile success", data: { run_id: runId, htmlLen: html?.length ?? 0 }, timestamp: Date.now(), hypothesisId: "H9" }) }).catch(() => {});
      // #endregion
      return {
        artifact_type: "email_template",
        artifact_class: "email_template",
        content: html,
        metadata: { brand_profile_id: brandCtx?.id, brand_color: brandColor, mjml: mjmlOut },
      };
    } catch (_e) {
      // #region agent log
      const errMsg = String((_e as Error).message).slice(0, 120);
      console.log("[MJML] template compile/render failed (H8)", { run_id: runId, err: errMsg, template_id: input.template_id });
      fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:compile failed", message: "MJML compile failed", data: { run_id: runId, err: errMsg }, timestamp: Date.now(), hypothesisId: "H8" }) }).catch(() => {});
      // #endregion
    }
  }

  console.log("[MJML] using LLM path (H8/H9)", { run_id: runId, hasTemplate: !!templateMjml, campaignPromptSnippet: campaignPrompt.slice(0, 60) });
  fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0db674" }, body: JSON.stringify({ sessionId: "0db674", location: "email-generate-mjml.ts:LLM path", message: "MJML using LLM path", data: { run_id: runId, hasTemplate: !!templateMjml }, timestamp: Date.now(), hypothesisId: "H9" }) }).catch(() => {});
  const messages: LLMChatOptions["messages"] = [];
  if (brandPrompt) {
    messages.push({
      role: "system",
      content: brandPrompt + `\nUse primary color ${brandColor} for buttons and headers. Generate a single HTML email (no MJML).`,
    });
  }
  const productSummary = products.length > 0
    ? products.map((p) => `${p.title ?? "Product"}: ${p.product_url ?? p.src ?? ""}`).join("\n")
    : "no products";
  messages.push({
    role: "user",
    content: `Write an email (HTML only, no MJML). Theme: ${campaignPrompt}. Products:\n${productSummary}. Audience: subscribers.`,
  });

  const result = await chat({
    model: "auto/chat",
    messages,
    context: {
      run_id: request.run_id,
      job_run_id: request.job_run_id,
      job_type: request.job_type,
      initiative_id: initiativeId,
    },
    brandContext: brandCtx ? { id: brandCtx.id, name: brandCtx.name, systemPrompt: brandPrompt } : undefined,
    useGateway: request.llm_source !== "openai_direct",
  });

  if (request.recordLlmCall) {
    await request.recordLlmCall(
      "auto/chat",
      result.model_id ?? "unknown",
      result.tokens_in,
      result.tokens_out,
      result.latency_ms,
    );
  }

  const content = result.content ?? "";
  const html = content.includes("<") ? content : `<html><body><p>${content.replace(/\n/g, "</p><p>")}</p></body></html>`;

  return {
    artifact_type: "email_template",
    artifact_class: "email_template",
    content: html,
    metadata: { brand_profile_id: brandCtx?.id, brand_color: brandColor },
  };
}
