import { chat, type LLMChatOptions } from "../llm-client.js";
import { loadBrandContext, brandContextToSystemPrompt } from "../brand-context.js";

export async function handleCopyGenerate(request: {
  run_id: string;
  job_run_id: string;
  job_type: string;
  initiative_id?: string;
  input?: { topic?: string; content_type?: string; length?: string };
}) {
  const brandCtx = request.initiative_id ? await loadBrandContext(request.initiative_id) : null;
  const brandPrompt = brandCtx ? brandContextToSystemPrompt(brandCtx) : "";

  const messages: LLMChatOptions["messages"] = [];
  if (brandPrompt) messages.push({ role: "system", content: brandPrompt });
  messages.push({
    role: "user",
    content: `Generate ${request.input?.content_type ?? "copy"} about: ${request.input?.topic ?? "the brand"}. Length: ${request.input?.length ?? "medium"}.`,
  });

  const result = await chat({
    model: "auto/chat",
    messages,
    context: { run_id: request.run_id, job_run_id: request.job_run_id, job_type: request.job_type, initiative_id: request.initiative_id },
    brandContext: brandCtx ? { id: brandCtx.id, name: brandCtx.name, systemPrompt: brandPrompt } : undefined,
  });

  return {
    artifact_type: "copy",
    artifact_class: "docs",
    content: result.content,
    metadata: { brand_profile_id: brandCtx?.id, content_type: request.input?.content_type },
  };
}
