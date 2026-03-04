import { chat } from "../llm-client.js";
import { loadBrandContext, brandContextToSystemPrompt, brandContextToDesignTokens } from "../brand-context.js";
import { tokens } from "../../../packages/ui/src/tokens.js";
export async function handleEmailGenerate(request) {
    const brandCtx = request.initiative_id ? await loadBrandContext(request.initiative_id) : null;
    const brandPrompt = brandCtx ? brandContextToSystemPrompt(brandCtx) : "";
    const mergedTokens = brandCtx ? brandContextToDesignTokens(brandCtx, tokens) : tokens;
    const brandColor = mergedTokens?.color?.brand?.["500"] ?? "#3b82f6";
    const messages = [];
    if (brandPrompt)
        messages.push({ role: "system", content: brandPrompt + `\nUse primary color ${brandColor} for buttons and headers.` });
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
//# sourceMappingURL=email-generate.js.map