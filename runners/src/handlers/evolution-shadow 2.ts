/**
 * Evolution Loop V1: evolution_shadow handler (stub).
 * Shadow runs candidate alongside baseline without affecting traffic; not implemented in V1.
 */

import type pg from "pg";
import type { EvolutionReplayPayload } from "./evolution-replay.js";

/**
 * Stub: shadow strategy is not implemented in V1.
 * Returns without writing fitness_scores; caller should set experiment status to 'aborted' or 'failed'.
 */
export async function runEvolutionShadow(
  _client: pg.PoolClient,
  _payload: EvolutionReplayPayload
): Promise<void> {
  throw new Error("evolution_shadow not implemented in V1; use traffic_strategy=replay");
}
