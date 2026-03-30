/**
 * LLM budgets: check before LLM call and record usage after (section 6.2).
 * Runner uses same DB as Control Plane; we query/update llm_budgets directly.
 */

import type pg from "pg";

export interface BudgetRow {
  id: string;
  scope_type: string;
  scope_value: string;
  budget_tokens: number | null;
  budget_dollars: number | null;
  /** Can be number or string (pg bigint). */
  current_usage: number | string;
}

/** Fetch active budget rows for job_type and optionally initiative_id. */
export async function getBudgetsForJob(
  client: pg.PoolClient,
  jobType: string,
  initiativeId: string | null
): Promise<BudgetRow[]> {
  let q: { rows: BudgetRow[] };
  if (initiativeId) {
    q = await client.query<BudgetRow>(
      `SELECT id, scope_type, scope_value, budget_tokens, budget_dollars, current_usage::bigint AS current_usage
       FROM llm_budgets WHERE active = true
         AND ((scope_type = $1 AND scope_value = $2) OR (scope_type = $3 AND scope_value = $4))`,
      ["job_type", jobType, "initiative", initiativeId]
    ).catch(() => ({ rows: [] }));
  } else {
    q = await client.query<BudgetRow>(
      `SELECT id, scope_type, scope_value, budget_tokens, budget_dollars, current_usage::bigint AS current_usage
       FROM llm_budgets WHERE active = true AND scope_type = $1 AND scope_value = $2`,
      ["job_type", jobType]
    ).catch(() => ({ rows: [] }));
  }
  return q.rows ?? [];
}

/** Check that adding tokensToAdd would not exceed any budget_tokens. Throws if over. */
export function checkBudgets(budgets: BudgetRow[], tokensToAdd: number): void {
  for (const b of budgets) {
    if (b.budget_tokens == null) continue;
    const current = Number(b.current_usage ?? 0);
    const after = current + tokensToAdd;
    if (after > b.budget_tokens) {
      throw new Error(
        `llm_budget exceeded: ${b.scope_type}=${b.scope_value} would be ${after} > ${b.budget_tokens} tokens`
      );
    }
  }
}

/** Increment current_usage by tokensUsed for each scope. */
export async function recordUsage(
  client: pg.PoolClient,
  scopeType: string,
  scopeValue: string,
  tokensUsed: number
): Promise<void> {
  await client.query(
    `UPDATE llm_budgets SET current_usage = current_usage + $1, updated_at = now()
     WHERE scope_type = $2 AND scope_value = $3 AND active = true`,
    [tokensUsed, scopeType, scopeValue]
  ).catch(() => {});
}
