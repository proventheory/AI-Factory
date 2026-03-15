import type { Pool } from "pg";

/** Look up incident_memory rows by failure_signature and optional failure_class. */
export async function lookupBySignature(
  pool: Pool,
  signature: string,
  failureClass: string | null,
  limit: number
): Promise<{ memory_id: string; failure_signature: string; failure_class: string; resolution: string; confidence: number; times_seen: number; last_seen_at: string }[]> {
  let q =
    "SELECT memory_id, failure_signature, failure_class, resolution, confidence, times_seen, last_seen_at FROM incident_memory WHERE 1=1";
  const params: unknown[] = [];
  let i = 1;
  if (signature) {
    q += ` AND (failure_signature = $${i++} OR failure_signature ILIKE $${i++})`;
    params.push(signature, `%${signature}%`);
  }
  if (failureClass) {
    q += ` AND failure_class = $${i++}`;
    params.push(failureClass);
  }
  q += ` ORDER BY last_seen_at DESC LIMIT $${i}`;
  params.push(limit);
  const r = await pool.query(q, params);
  return r.rows;
}

/** Record or upsert a resolution in incident_memory (upsert by failure_signature + failure_class, bump times_seen). */
export async function recordResolution(
  pool: Pool,
  failureSignature: string,
  failureClass: string,
  resolution: string,
  confidence: number = 0.8
): Promise<void> {
  const existing = await pool.query(
    "SELECT memory_id, times_seen FROM incident_memory WHERE failure_signature = $1 AND failure_class = $2",
    [failureSignature, failureClass]
  );
  if (existing.rows.length > 0) {
    await pool.query(
      "UPDATE incident_memory SET resolution = $1, confidence = $2, times_seen = times_seen + 1, last_seen_at = now() WHERE memory_id = $3",
      [resolution, confidence, existing.rows[0].memory_id]
    );
  } else {
    await pool.query(
      "INSERT INTO incident_memory (failure_signature, failure_class, resolution, confidence) VALUES ($1, $2, $3, $4)",
      [failureSignature, failureClass, resolution, confidence]
    );
  }
}
