export interface DividerConfig {
  title?: string;
}

export function renderDividerToHtml(config: DividerConfig): string {
  return config.title
    ? `<div style="text-align:center;padding:32px 0;"><hr style="border:none;border-top:2px solid #e2e8f0;margin-bottom:16px;" /><h2 style="font-size:24px;font-weight:600;">${config.title}</h2></div>`
    : `<hr style="border:none;border-top:2px solid #e2e8f0;margin:24px 0;" />`;
}
