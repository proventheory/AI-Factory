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
    website?: string;
    contact_email?: string;
    location?: string;
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
export declare function loadBrandContext(initiativeId: string): Promise<BrandContext | null>;
export declare function clearBrandCache(): void;
export declare function brandContextToSystemPrompt(ctx: BrandContext): string;
export declare function brandContextToDesignTokens(ctx: BrandContext, defaults: Record<string, unknown>): Record<string, unknown>;
//# sourceMappingURL=brand-context.d.ts.map