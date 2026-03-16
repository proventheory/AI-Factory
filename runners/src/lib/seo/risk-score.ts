/**
 * Ranking risk: combine SEO value score (GSC/GA/backlinks) with migration defect score → risk_score, risk_level.
 */

export type RiskLevel = "critical" | "high" | "medium" | "low";

export interface RiskInputPerUrl {
  source_url: string;
  target_url: string | null;
  redirect_ok?: boolean;
  content_result?: "pass" | "warning" | "fail";
  technical_severity?: "critical" | "high" | "medium" | "low" | "ok";
  gsc_clicks?: number;
  gsc_impressions?: number;
  ga_sessions?: number;
  backlinks?: number;
  url_type?: string;
}

/** Normalize a value to 0..1 given a max (avoid div by zero). */
function norm(v: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, v / max));
}

/**
 * Compute per-URL risk. SEO value from GSC/GA/backlinks when present; defect from redirect + content + technical.
 * risk_score >= 0.75 → critical; >= 0.50 → high; >= 0.25 → medium; else low.
 */
export function computeRiskScore(input: RiskInputPerUrl, globalMax?: { clicks?: number; impressions?: number; sessions?: number; backlinks?: number }): {
  risk_score: number;
  risk_level: RiskLevel;
  seo_value_score: number;
  migration_defect_score: number;
  issue_codes: string[];
  recommended_actions: string[];
} {
  const issueCodes: string[] = [];
  const actions: string[] = [];

  let seoValue = 0.5;
  if (
    (input.gsc_clicks ?? 0) > 0 ||
    (input.gsc_impressions ?? 0) > 0 ||
    (input.ga_sessions ?? 0) > 0 ||
    (input.backlinks ?? 0) > 0
  ) {
    const max = globalMax ?? {};
    const wClicks = 0.4 * norm(input.gsc_clicks ?? 0, max.clicks ?? Math.max(1, input.gsc_clicks ?? 1));
    const wImpr = 0.2 * norm(input.gsc_impressions ?? 0, max.impressions ?? Math.max(1, input.gsc_impressions ?? 1));
    const wSess = 0.25 * norm(input.ga_sessions ?? 0, max.sessions ?? Math.max(1, input.ga_sessions ?? 1));
    const wBack = 0.15 * norm(input.backlinks ?? 0, max.backlinks ?? Math.max(1, input.backlinks ?? 1));
    seoValue = wClicks + wImpr + wSess + wBack;
    if (seoValue <= 0) seoValue = 0.3;
  }

  let redirectDefect = 0;
  if (input.redirect_ok === false) {
    redirectDefect = 1;
    issueCodes.push("redirect_fail");
    actions.push("Fix redirect: ensure source URL redirects to correct target (301)");
  } else if (input.target_url == null) {
    redirectDefect = 1;
    issueCodes.push("no_match");
    actions.push("Add redirect or create destination page for this URL");
  }

  let contentDefect = 0;
  if (input.content_result === "fail") {
    contentDefect = 1;
    issueCodes.push("content_fail");
    actions.push("Restore or add matching content on target page");
  } else if (input.content_result === "warning") {
    contentDefect = 0.5;
    issueCodes.push("content_warning");
    actions.push("Review content parity: title, H1, word count, schema");
  }

  let technicalDefect = 0;
  switch (input.technical_severity) {
    case "critical":
      technicalDefect = 1;
      issueCodes.push("technical_critical");
      actions.push("Fix critical technical issues: status, noindex, canonical");
      break;
    case "high":
      technicalDefect = 0.75;
      issueCodes.push("technical_high");
      actions.push("Fix canonical/status regression on target");
      break;
    case "medium":
      technicalDefect = 0.5;
      issueCodes.push("technical_medium");
      actions.push("Add missing title/schema on target");
      break;
    case "low":
      technicalDefect = 0.25;
      break;
    default:
      break;
  }

  const migrationDefect = 0.3 * redirectDefect + 0.25 * contentDefect + 0.2 * technicalDefect +
    (issueCodes.length > 0 ? 0.1 : 0);
  const migrationDefectScore = Math.min(1, migrationDefect);

  const riskScore = seoValue * 0.4 + migrationDefectScore * 0.6;
  let riskLevel: RiskLevel = "low";
  if (riskScore >= 0.75) riskLevel = "critical";
  else if (riskScore >= 0.5) riskLevel = "high";
  else if (riskScore >= 0.25) riskLevel = "medium";

  return {
    risk_score: Math.round(riskScore * 100) / 100,
    risk_level: riskLevel,
    seo_value_score: Math.round(seoValue * 100) / 100,
    migration_defect_score: Math.round(migrationDefectScore * 100) / 100,
    issue_codes: [...new Set(issueCodes)],
    recommended_actions: [...new Set(actions)],
  };
}
