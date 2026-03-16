/**
 * Content parity: compare title, H1, meta, word count, schema between source and target records.
 */

export interface ContentParityComparison {
  source_url: string;
  target_url: string;
  title_similarity: number;
  h1_similarity: number;
  meta_similarity: number;
  word_count_old: number | null;
  word_count_new: number | null;
  word_count_delta_pct: number | null;
  faq_preserved: boolean | null;
  schema_preserved: boolean | null;
  result: "pass" | "warning" | "fail";
  issue_codes: string[];
  notes?: string;
}

function normalizeForCompare(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Jaccard-like token similarity 0..1. */
function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeForCompare(a).split(/\s+/).filter(Boolean));
  const tb = new Set(normalizeForCompare(b).split(/\s+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter++;
  }
  return inter / Math.max(ta.size, tb.size);
}

export interface SourceTargetRecord {
  title?: string | null;
  meta_description?: string | null;
  h1?: string | null;
  word_count?: number | null;
  schema_types?: string[] | null;
}

export function compareContentParity(
  source: SourceTargetRecord | undefined,
  target: SourceTargetRecord | undefined,
  sourceUrl: string,
  targetUrl: string,
): ContentParityComparison {
  const issueCodes: string[] = [];
  let result: "pass" | "warning" | "fail" = "pass";

  const titleSim = source && target ? tokenSimilarity(source.title ?? "", target.title ?? "") : 1;
  const h1Sim = source && target ? tokenSimilarity(source.h1 ?? "", target.h1 ?? "") : 1;
  const metaSim = source && target ? tokenSimilarity(source.meta_description ?? "", target.meta_description ?? "") : 1;

  if (source && target) {
    if (titleSim < 0.5) {
      issueCodes.push("title_changed");
      result = result === "pass" ? "warning" : result;
    }
    if (h1Sim < 0.5) {
      issueCodes.push("h1_missing");
      result = result === "pass" ? "warning" : result;
    }
    const wOld = source.word_count ?? 0;
    const wNew = target.word_count ?? 0;
    let deltaPct: number | null = null;
    if (wOld > 0 && wNew >= 0) {
      deltaPct = ((wNew - wOld) / wOld) * 100;
      if (deltaPct < -40) {
        issueCodes.push("content_loss");
        result = "warning";
      }
      if (wNew < 100 && wOld > 200) {
        issueCodes.push("thin_content");
        result = "warning";
      }
    }
    const srcSchema = new Set(source.schema_types ?? []);
    const tgtSchema = new Set(target.schema_types ?? []);
    const schemaPreserved = srcSchema.size === 0 || (tgtSchema.size > 0 && [...srcSchema].every((t) => tgtSchema.has(t)));
    if (!schemaPreserved && srcSchema.size > 0) {
      issueCodes.push("schema_removed");
      result = result === "pass" ? "warning" : result;
    }

    return {
      source_url: sourceUrl,
      target_url: targetUrl,
      title_similarity: titleSim,
      h1_similarity: h1Sim,
      meta_similarity: metaSim,
      word_count_old: wOld || null,
      word_count_new: wNew || null,
      word_count_delta_pct: deltaPct,
      faq_preserved: null,
      schema_preserved: schemaPreserved,
      result,
      issue_codes: issueCodes,
    };
  }

  if (!target) issueCodes.push("unmatched_page");
  return {
    source_url: sourceUrl,
    target_url: targetUrl,
    title_similarity: source && target ? titleSim : 0,
    h1_similarity: source && target ? h1Sim : 0,
    meta_similarity: source && target ? metaSim : 0,
    word_count_old: source?.word_count ?? null,
    word_count_new: target?.word_count ?? null,
    word_count_delta_pct: null,
    faq_preserved: null,
    schema_preserved: null,
    result: !target ? "fail" : "pass",
    issue_codes: issueCodes,
  };
}
