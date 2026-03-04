/**
 * Brand context: loads brand profile for an initiative and formats it
 * for injection into LLM system prompts and design token resolution.
 */

export interface BrandIdentity {
  archetype?: string;
  industry?: string;
  tagline?: string;
  mission?: string;
  values?: string[];
  target_audience?: string;
  competitive_position?: string;
  personality_traits?: string[];
}

export interface BrandTone {
  voice_descriptors?: string[];
  reading_level?: string;
  sentence_length?: string;
  formality?: string;
  humor?: string;
  empathy_level?: string;
  urgency?: string;
  technical_depth?: string;
}

export interface BrandVisualStyle {
  density?: string;
  style_description?: string;
  image_style?: string;
  illustration_style?: string;
  icon_style?: string;
  border_style?: string;
  animation_level?: string;
  chart_style?: string;
}

export interface BrandCopyStyle {
  voice?: string;
  banned_words?: string[];
  preferred_phrases?: string[];
  cta_style?: string;
  headline_style?: string;
  paragraph_max_sentences?: number;
  bullet_point_style?: string;
  capitalization?: string;
}

export interface BrandDeckTheme {
  slide_master?: Record<string, unknown>;
  chart_color_sequence?: string[];
  kpi_card_style?: Record<string, unknown>;
  table_style?: Record<string, unknown>;
  title_slide?: Record<string, unknown>;
  divider_slide?: Record<string, unknown>;
  font_config?: Record<string, unknown>;
  default_layout?: string;
}

export interface BrandReportTheme {
  header_style?: Record<string, unknown>;
  footer_style?: Record<string, unknown>;
  section_spacing?: string;
  chart_defaults?: Record<string, unknown>;
  callout_style?: Record<string, unknown>;
  table_style?: Record<string, unknown>;
  toc_style?: Record<string, unknown>;
  page_margins?: Record<string, unknown>;
}

export interface BrandContext {
  id: string;
  name: string;
  slug?: string;
  identity: BrandIdentity;
  tone: BrandTone;
  visual_style: BrandVisualStyle;
  copy_style: BrandCopyStyle;
  design_tokens: Record<string, unknown>;
  deck_theme: BrandDeckTheme;
  report_theme: BrandReportTheme;
}

const brandCache = new Map<string, { ctx: BrandContext; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCpApiUrl(): string {
  return (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

export async function loadBrandContext(initiativeId: string): Promise<BrandContext | null> {
  const cpUrl = getCpApiUrl();
  try {
    const initRes = await fetch(`${cpUrl}/v1/initiatives/${initiativeId}`);
    if (!initRes.ok) return null;
    const init = (await initRes.json()) as { brand_profile_id?: string | null };
    if (!init.brand_profile_id) return null;

    const cached = brandCache.get(init.brand_profile_id);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.ctx;

    const brandRes = await fetch(`${cpUrl}/v1/brand_profiles/${init.brand_profile_id}`);
    if (!brandRes.ok) return null;
    const profile = (await brandRes.json()) as Record<string, unknown>;

    const ctx: BrandContext = {
      id: profile.id as string,
      name: profile.name as string,
      slug: profile.slug as string,
      identity: (profile.identity as Record<string, unknown>) ?? {},
      tone: (profile.tone as Record<string, unknown>) ?? {},
      visual_style: (profile.visual_style as Record<string, unknown>) ?? {},
      copy_style: (profile.copy_style as Record<string, unknown>) ?? {},
      design_tokens: (profile.design_tokens as Record<string, unknown>) ?? {},
      deck_theme: (profile.deck_theme as Record<string, unknown>) ?? {},
      report_theme: (profile.report_theme as Record<string, unknown>) ?? {},
    };

    brandCache.set(init.brand_profile_id, { ctx, ts: Date.now() });
    return ctx;
  } catch {
    return null;
  }
}

export function clearBrandCache(): void {
  brandCache.clear();
}

export function brandContextToSystemPrompt(ctx: BrandContext): string {
  const lines: string[] = [`You are generating content for the brand "${ctx.name}".`];

  if (ctx.identity.archetype) lines.push(`Brand archetype: ${ctx.identity.archetype}.`);
  if (ctx.identity.industry) lines.push(`Industry: ${ctx.identity.industry}.`);
  if (ctx.identity.tagline) lines.push(`Tagline: "${ctx.identity.tagline}".`);

  if (ctx.tone.voice_descriptors?.length) {
    lines.push(`Voice: ${ctx.tone.voice_descriptors.join(", ")}.`);
  }
  if (ctx.tone.reading_level) lines.push(`Reading level: ${ctx.tone.reading_level}.`);
  if (ctx.tone.sentence_length) lines.push(`Sentence length: ${ctx.tone.sentence_length}.`);
  if (ctx.tone.formality) lines.push(`Formality: ${ctx.tone.formality}.`);

  if (ctx.copy_style.voice) lines.push(`Copy voice: ${ctx.copy_style.voice}.`);
  if (ctx.copy_style.banned_words?.length) {
    lines.push(`Never use these words: ${ctx.copy_style.banned_words.join(", ")}.`);
  }
  if (ctx.copy_style.preferred_phrases?.length) {
    lines.push(`Prefer these phrases: ${ctx.copy_style.preferred_phrases.join(", ")}.`);
  }
  if (ctx.copy_style.cta_style) lines.push(`CTA style: ${ctx.copy_style.cta_style}.`);

  if (ctx.visual_style.density) lines.push(`UI density: ${ctx.visual_style.density}.`);
  if (ctx.visual_style.style_description) {
    lines.push(`Visual style: ${ctx.visual_style.style_description}.`);
  }

  return lines.join("\n");
}

export function brandContextToDesignTokens(
  ctx: BrandContext,
  defaults: Record<string, unknown>
): Record<string, unknown> {
  return deepMerge(defaults, ctx.design_tokens);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
