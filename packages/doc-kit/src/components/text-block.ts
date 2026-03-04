export interface TextBlockConfig {
  content: string;
  alignment?: "left" | "center" | "right";
}

export function renderTextBlockToHtml(config: TextBlockConfig): string {
  return `<div style="text-align:${config.alignment ?? "left"};padding:8px 0;">${config.content}</div>`;
}
