/**
 * Signature matcher: after evidence exists, apply rule-based matchers (and optionally LLM) to classify incident.
 * Writes incident_signature_matches, sets incident.current_signature_id, deterministic_failure, confidence, status = 'classified'.
 */

import { pool } from "../db.js";

const RULE_PATTERNS: { signature_key: string; patterns: (string | RegExp)[] }[] = [
  { signature_key: "boot_failed.migration.duplicate_policy", patterns: ["policy .* already exists", "duplicate_object", "42710"] },
  { signature_key: "boot_failed.migration.missing_relation", patterns: ["relation .* does not exist", "42P01"] },
  { signature_key: "boot_failed.env.missing_secret", patterns: ["missing env", "undefined secret"] },
  { signature_key: "runtime_failed.healthcheck_timeout", patterns: ["healthcheck", "timeout", "unhealthy"] },
];

/**
 * Run rule-based classification on incident evidence; update incident and insert signature match.
 */
export async function classifyIncident(incidentId: string): Promise<{ signatureKey: string | null; confidence: number }> {
  const evidence = await pool.query(
    `SELECT content_text, evidence_type FROM incident_evidence WHERE incident_id = $1 ORDER BY created_at DESC`,
    [incidentId]
  );
  const text = evidence.rows
    .map((r: { content_text: string | null }) => r.content_text)
    .filter(Boolean)
    .join("\n");

  let matchedKey: string | null = null;
  let confidence = 0;

  for (const { signature_key, patterns } of RULE_PATTERNS) {
    for (const p of patterns) {
      const re = typeof p === "string" ? new RegExp(p, "i") : p;
      if (re.test(text)) {
        matchedKey = signature_key;
        confidence = 0.9;
        break;
      }
    }
    if (matchedKey) break;
  }

  if (!matchedKey) {
    await pool.query(
      `UPDATE incidents SET status = 'classified', deterministic_failure = true, confidence = 0.5, root_cause_summary = 'Unclassified (no rule match)', updated_at = now() WHERE id = $1`,
      [incidentId]
    );
    return { signatureKey: null, confidence: 0.5 };
  }

  const sig = await pool.query("SELECT id FROM failure_signatures WHERE signature_key = $1", [matchedKey]);
  const signatureId = sig.rows[0]?.id as string | undefined;
  if (signatureId) {
    await pool.query(
      `INSERT INTO incident_signature_matches (incident_id, signature_id, confidence, matched_by) VALUES ($1, $2, $3, 'rule')`,
      [incidentId, signatureId, confidence]
    );
    await pool.query(
      `UPDATE incidents SET status = 'classified', current_signature_id = $1, deterministic_failure = true, confidence = $2, root_cause_summary = $3, updated_at = now() WHERE id = $4`,
      [signatureId, confidence, `Matched: ${matchedKey}`, incidentId]
    );
  }

  return { signatureKey: matchedKey, confidence };
}

/**
 * Classify all incidents in 'collecting_evidence'.
 */
export async function classifyAllCollectingEvidence(): Promise<{ classified: number }> {
  const list = await pool.query("SELECT id FROM incidents WHERE status = 'collecting_evidence'");
  let classified = 0;
  for (const r of list.rows) {
    await classifyIncident((r as { id: string }).id);
    classified++;
  }
  return { classified };
}
