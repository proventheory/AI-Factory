/**
 * Brand context: loads brand profile for an initiative and formats it
 * for injection into LLM system prompts and design token resolution.
 */
const brandCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
function getCpApiUrl() {
    return (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
}
export async function loadBrandContext(initiativeId) {
    const cpUrl = getCpApiUrl();
    try {
        const initRes = await fetch(`${cpUrl}/v1/initiatives/${initiativeId}`);
        if (!initRes.ok)
            return null;
        const init = (await initRes.json());
        if (!init.brand_profile_id)
            return null;
        const cached = brandCache.get(init.brand_profile_id);
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS)
            return cached.ctx;
        const brandRes = await fetch(`${cpUrl}/v1/brand_profiles/${init.brand_profile_id}`);
        if (!brandRes.ok)
            return null;
        const profile = (await brandRes.json());
        const ctx = {
            id: profile.id,
            name: profile.name,
            slug: profile.slug,
            identity: profile.identity ?? {},
            tone: profile.tone ?? {},
            visual_style: profile.visual_style ?? {},
            copy_style: profile.copy_style ?? {},
            design_tokens: profile.design_tokens ?? {},
            deck_theme: profile.deck_theme ?? {},
            report_theme: profile.report_theme ?? {},
        };
        brandCache.set(init.brand_profile_id, { ctx, ts: Date.now() });
        return ctx;
    }
    catch {
        return null;
    }
}
export function clearBrandCache() {
    brandCache.clear();
}
export function brandContextToSystemPrompt(ctx) {
    const lines = [`You are generating content for the brand "${ctx.name}".`];
    if (ctx.identity.archetype)
        lines.push(`Brand archetype: ${ctx.identity.archetype}.`);
    if (ctx.identity.industry)
        lines.push(`Industry: ${ctx.identity.industry}.`);
    if (ctx.identity.tagline)
        lines.push(`Tagline: "${ctx.identity.tagline}".`);
    if (ctx.tone.voice_descriptors?.length) {
        lines.push(`Voice: ${ctx.tone.voice_descriptors.join(", ")}.`);
    }
    if (ctx.tone.reading_level)
        lines.push(`Reading level: ${ctx.tone.reading_level}.`);
    if (ctx.tone.sentence_length)
        lines.push(`Sentence length: ${ctx.tone.sentence_length}.`);
    if (ctx.tone.formality)
        lines.push(`Formality: ${ctx.tone.formality}.`);
    if (ctx.copy_style.voice)
        lines.push(`Copy voice: ${ctx.copy_style.voice}.`);
    if (ctx.copy_style.banned_words?.length) {
        lines.push(`Never use these words: ${ctx.copy_style.banned_words.join(", ")}.`);
    }
    if (ctx.copy_style.preferred_phrases?.length) {
        lines.push(`Prefer these phrases: ${ctx.copy_style.preferred_phrases.join(", ")}.`);
    }
    if (ctx.copy_style.cta_style)
        lines.push(`CTA style: ${ctx.copy_style.cta_style}.`);
    if (ctx.visual_style.density)
        lines.push(`UI density: ${ctx.visual_style.density}.`);
    if (ctx.visual_style.style_description) {
        lines.push(`Visual style: ${ctx.visual_style.style_description}.`);
    }
    return lines.join("\n");
}
export function brandContextToDesignTokens(ctx, defaults) {
    return deepMerge(defaults, ctx.design_tokens);
}
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key]) &&
            target[key] &&
            typeof target[key] === "object" &&
            !Array.isArray(target[key])) {
            result[key] = deepMerge(target[key], source[key]);
        }
        else {
            result[key] = source[key];
        }
    }
    return result;
}
//# sourceMappingURL=brand-context.js.map