/** DB enum risk_level is 'low' | 'med' | 'high'. Normalize 'medium' -> 'med' so old clients never break. */
export function normalizeRiskLevel(s: string | undefined): "low" | "med" | "high" {
  if (s === "medium") return "med";
  if (s === "low" || s === "med" || s === "high") return s;
  return "med";
}
