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
  products?: Array<{ src?: string; title?: string; product_url?: string }>;
  campaign_prompt?: string;
}

export async function handleEmailGenerateMjml(request: {
  run_id: string;
  job_run_id: string;
  job_type: string;
  initiative_id?: string;
  llm_source?: "gateway" | "openai_direct";
  input?: EmailGenerateMjmlInput;
}) {
  const brandCtx = request.initiative_id ? await loadBrandContext(request.initiative_id) : null;
  const brandPrompt = brandCtx ? brandContextToSystemPrompt(brandCtx) : "";
  const mergedTokens = brandCtx ? brandContextToDesignTokens(brandCtx, tokens as unknown as Record<string, unknown>) : tokens;
  const brandColor = (mergedTokens as Record<string, unknown>)?.color && typeof (mergedTokens as Record<string, unknown>).color === "object"
    ? ((mergedTokens as Record<string, unknown>).color as Record<string, Record<string, string>>)?.brand?.["500"] ?? "#3b82f6"
    : "#3b82f6";

  let input: EmailGenerateMjmlInput = request.input ?? {};
  if (request.initiative_id) {
    try {
      const campRes = await fetch(`${CONTROL_PLANE_URL}/v1/email_campaigns/${request.initiative_id}`);
      if (campRes.ok) {
        const camp = (await campRes.json()) as { template_id?: string; metadata_json?: { products?: unknown[]; campaign_prompt?: string } };
        if (camp.template_id) input.template_id = input.template_id ?? camp.template_id;
        if (camp.metadata_json && typeof camp.metadata_json === "object") {
          const meta = camp.metadata_json as { products?: unknown[]; campaign_prompt?: string };
          if (meta.products && !input.products?.length) input.products = meta.products as EmailGenerateMjmlInput["products"];
          if (meta.campaign_prompt) input.campaign_prompt = input.campaign_prompt ?? meta.campaign_prompt;
        }
      }
    } catch (_e) {
      // use request.input only
    }
  }

  let templateMjml: string | null = null;
  let templateJson: Record<string, unknown> | null = null;

  if (input.template_id) {
    try {
      const res = await fetch(`${CONTROL_PLANE_URL}/v1/email_templates/${input.template_id}`);
      if (res.ok) {
        const t = (await res.json()) as { mjml?: string; template_json?: unknown };
        templateMjml = t.mjml ?? null;
        templateJson = (t.template_json as Record<string, unknown>) ?? null;
      }
    } catch (_e) {
      // proceed without template
    }
  }

  const products = input.products ?? [];
  const campaignPrompt = input.campaign_prompt ?? "newsletter";

  if (templateMjml && products.length > 0) {
    try {
      const sectionJson: Record<string, unknown> = {
        ...(templateJson ?? {}),
        products: products.map((p) => ({
          name: p.title ?? "Product",
          link: p.product_url ?? p.src ?? "#",
          image: p.src ?? "",
        })),
        brandColor,
        voicetone: brandCtx?.tone?.voice_descriptors?.[0] ?? "friendly",
        footerRights: `© ${new Date().getFullYear()}`,
        contactInfo: "",
        socialMedia: [],
      };
      const compile = Handlebars.compile(templateMjml);
      const mjmlOut = compile(sectionJson);
      const { html } = mjml2html(mjmlOut, { minify: true });
      return {
        artifact_type: "email_template",
        artifact_class: "email_template",
        content: html,
        metadata: { brand_profile_id: brandCtx?.id, brand_color: brandColor, mjml: mjmlOut },
      };
    } catch (e) {
      // fall through to LLM-generated email
    }
  }

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
      initiative_id: request.initiative_id,
    },
    brandContext: brandCtx ? { id: brandCtx.id, name: brandCtx.name, systemPrompt: brandPrompt } : undefined,
    useGateway: request.llm_source !== "openai_direct",
  });

  const content = result.content ?? "";
  const html = content.includes("<") ? content : `<html><body><p>${content.replace(/\n/g, "</p><p>")}</p></body></html>`;

  return {
    artifact_type: "email_template",
    artifact_class: "email_template",
    content: html,
    metadata: { brand_profile_id: brandCtx?.id, brand_color: brandColor },
  };
}
