export interface TimelineConfig {
  items: { date: string; title: string; description?: string; status?: "completed" | "in_progress" | "upcoming" }[];
}

export function renderTimelineToHtml(config: TimelineConfig): string {
  const statusDot: Record<string, string> = { completed: "#059669", in_progress: "#3b82f6", upcoming: "#94a3b8" };
  return `<div style="padding:8px 0;">${config.items.map(item => {
    const color = statusDot[item.status ?? "upcoming"] ?? "#94a3b8";
    return `<div style="display:flex;gap:12px;margin-bottom:16px;"><div style="width:12px;height:12px;border-radius:50%;background:${color};margin-top:4px;flex-shrink:0;"></div><div><p style="font-weight:600;">${item.title}</p><p style="font-size:12px;color:#64748b;">${item.date}</p>${item.description ? `<p style="font-size:14px;margin-top:4px;">${item.description}</p>` : ""}</div></div>`;
  }).join("")}</div>`;
}
