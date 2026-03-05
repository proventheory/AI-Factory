import { chat, type LLMChatOptions } from "../llm-client.js";
import { loadBrandContext, brandContextToSystemPrompt, brandContextToDesignTokens } from "../brand-context.js";
import { tokens } from "../tokens.js";

export async function handleEmailGenerate(request: {
  run_id: string;
  job_run_id: string;
  job_type: string;
  initiative_id?: string;
  input?: { subject_hint?: string; audience?: string };
}) {
  const brandCtx = request.initiative_id ? await loadBrandContext(request.initiative_id) : null;
  const brandPrompt = brandCtx ? brandContextToSystemPrompt(brandCtx) : "";
  const mergedTokens = brandCtx ? brandContextToDesignTokens(brandCtx, tokens as unknown as Record<string, unknown>) : tokens;
  const brandColor = (mergedTokens as any)?.color?.brand?.["500"] ?? "#3b82f6";

  const messages: LLMChatOptions["messages"] = [];
  if (brandPrompt) messages.push({ role: "system", content: brandPrompt + `\nUse primary color ${brandColor} for buttons and headers.` });
  messages.push({ role: "user", content: `Write an email. Subject hint: ${request.input?.subject_hint ?? "newsletter"}. Audience: ${request.input?.audience ?? "subscribers"}.` });

  const result = await chat({
    model: "auto/chat",
    messages,
    context: { run_id: request.run_id, job_run_id: request.job_run_id, job_type: request.job_type, initiative_id: request.initiative_id },
    brandContext: brandCtx ? { id: brandCtx.id, name: brandCtx.name, systemPrompt: brandPrompt } : undefined,
  });

  return {
    artifact_type: "email_template",
    artifact_class: "email_template",
    content: result.content,
    metadata: { brand_profile_id: brandCtx?.id, brand_color: brandColor },
  };
}
