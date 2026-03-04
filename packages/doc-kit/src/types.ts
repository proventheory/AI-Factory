export interface RenderContext {
  designTokens: Record<string, unknown>;
  deckTheme: DeckThemeConfig;
  reportTheme: ReportThemeConfig;
  brandAssets?: { logo?: string; icon?: string };
}

export interface DeckThemeConfig {
  slide_master?: { background_color?: string; logo_placement?: string; footer_text?: string };
  chart_color_sequence?: string[];
  kpi_card_style?: { bg_color?: string; text_color?: string; border?: string };
  table_style?: { header_bg?: string; row_stripe?: string; border_color?: string };
  font_config?: { heading_font?: string; body_font?: string };
  default_layout?: string;
}

export interface ReportThemeConfig {
  header_style?: { logo?: string; title_font?: string; border_bottom?: boolean };
  footer_style?: { page_numbers?: boolean; copyright?: string };
  section_spacing?: string;
  chart_defaults?: { width?: number; height?: number; grid_lines?: boolean };
  callout_style?: { bg_color?: string; border_color?: string; icon?: string };
  table_style?: { header_bg?: string; stripe?: boolean; font_size?: string };
}

export type ComponentType = 'kpi_card' | 'table_block' | 'chart_block' | 'callout' | 'timeline' | 'pricing_table' | 'cover_slide' | 'divider' | 'text_block' | 'image_block' | 'two_column' | 'header_block' | 'footer_block';

export interface DocumentComponentConfig {
  type: ComponentType;
  config: Record<string, unknown>;
}
