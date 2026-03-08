/**
 * Plan compiler: initiative → DAG (nodes + edges).
 * Templates: software (prd→design→code→test→review), issue_fix, migration, factory_ops, ci_gate, Crew.
 * See docs/TODO_MULTI_FRAMEWORK_PLAN.md and multi-framework plan.
 */

import { createHash } from "crypto";
import type { DbClient } from "./db.js";
import type { Initiative, PlanNode, PlanEdge } from "./types.js";

export type AgentRole = "product_manager" | "architect" | "engineer" | "qa" | "reviewer";

export interface PlanTemplateNode {
  node_key: string;
  job_type: string;
  agent_role: AgentRole;
  node_type: "job" | "gate" | "approval" | "validator";
  consumes_artifact_types?: string[];
}

export interface PlanTemplateEdge {
  from_key: string;
  to_key: string;
  condition?: string;
}

const TEMPLATE_SOFTWARE: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "prd", job_type: "prd", agent_role: "product_manager", node_type: "job" },
    { node_key: "design", job_type: "design", agent_role: "architect", node_type: "job", consumes_artifact_types: ["prd_doc"] },
    { node_key: "code", job_type: "codegen", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["design"] },
    { node_key: "test", job_type: "unit_test", agent_role: "qa", node_type: "job", consumes_artifact_types: ["code"] },
    { node_key: "review", job_type: "code_review", agent_role: "reviewer", node_type: "job", consumes_artifact_types: ["code", "test"] },
  ],
  edges: [
    { from_key: "prd", to_key: "design", condition: "success" },
    { from_key: "design", to_key: "code", condition: "success" },
    { from_key: "code", to_key: "test", condition: "success" },
    { from_key: "test", to_key: "review", condition: "success" },
  ],
};

const TEMPLATE_ISSUE_FIX: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "analyze", job_type: "analyze_repo", agent_role: "engineer", node_type: "job" },
    { node_key: "patch", job_type: "write_patch", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["repo_summary"] },
    { node_key: "tests", job_type: "unit_test", agent_role: "qa", node_type: "job", consumes_artifact_types: ["patch"] },
    { node_key: "submit", job_type: "submit_pr", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["patch"] },
  ],
  edges: [
    { from_key: "analyze", to_key: "patch", condition: "success" },
    { from_key: "patch", to_key: "tests", condition: "success" },
    { from_key: "tests", to_key: "submit", condition: "success" },
  ],
};

const TEMPLATE_MIGRATION: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "analyze", job_type: "analyze_repo", agent_role: "architect", node_type: "job" },
    { node_key: "plan_migration", job_type: "plan_migration", agent_role: "architect", node_type: "job", consumes_artifact_types: ["repo_summary"] },
    { node_key: "apply_batch", job_type: "apply_batch", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["migration_plan"] },
    { node_key: "validate", job_type: "unit_test", agent_role: "qa", node_type: "job", consumes_artifact_types: ["apply_batch"] },
  ],
  edges: [
    { from_key: "analyze", to_key: "plan_migration", condition: "success" },
    { from_key: "plan_migration", to_key: "apply_batch", condition: "success" },
    { from_key: "apply_batch", to_key: "validate", condition: "success" },
  ],
};

const TEMPLATE_FACTORY_OPS: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "review_pr", job_type: "code_review", agent_role: "reviewer", node_type: "job" },
    { node_key: "apply_fixes", job_type: "codegen", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["review_verdict"] },
    { node_key: "security_patch", job_type: "write_patch", agent_role: "engineer", node_type: "job" },
  ],
  edges: [
    { from_key: "review_pr", to_key: "apply_fixes", condition: "success" },
    { from_key: "apply_fixes", to_key: "security_patch", condition: "success" },
  ],
};

const TEMPLATE_CI_GATE: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "code_review", job_type: "code_review", agent_role: "reviewer", node_type: "job" },
    { node_key: "qa_validator", job_type: "unit_test", agent_role: "qa", node_type: "validator", consumes_artifact_types: ["review_verdict"] },
  ],
  edges: [
    { from_key: "code_review", to_key: "qa_validator", condition: "success" },
  ],
};

const TEMPLATE_CREW: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "researcher", job_type: "research", agent_role: "product_manager", node_type: "job" },
    { node_key: "planner", job_type: "design", agent_role: "architect", node_type: "job", consumes_artifact_types: ["research"] },
    { node_key: "writer", job_type: "codegen", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["design"] },
    { node_key: "qa", job_type: "unit_test", agent_role: "qa", node_type: "job", consumes_artifact_types: ["code"] },
  ],
  edges: [
    { from_key: "researcher", to_key: "planner", condition: "success" },
    { from_key: "planner", to_key: "writer", condition: "success" },
    { from_key: "writer", to_key: "qa", condition: "success" },
  ],
};

const TEMPLATE_SELF_HEAL: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "analyze", job_type: "analyze_repo", agent_role: "engineer", node_type: "job" },
    { node_key: "resolve", job_type: "openhands_resolver", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["repo_summary"] },
    { node_key: "review", job_type: "code_review", agent_role: "reviewer", node_type: "job", consumes_artifact_types: ["resolver_patch"] },
    { node_key: "submit", job_type: "submit_pr", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["resolver_patch"] },
  ],
  edges: [
    { from_key: "analyze", to_key: "resolve", condition: "success" },
    { from_key: "resolve", to_key: "review", condition: "success" },
    { from_key: "review", to_key: "submit", condition: "success" },
  ],
};

const TEMPLATE_SWE_AGENT: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "analyze", job_type: "analyze_repo", agent_role: "engineer", node_type: "job" },
    { node_key: "fix", job_type: "swe_agent", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["repo_summary"] },
    { node_key: "test", job_type: "unit_test", agent_role: "qa", node_type: "job", consumes_artifact_types: ["swe_agent_patch"] },
    { node_key: "review", job_type: "code_review", agent_role: "reviewer", node_type: "job", consumes_artifact_types: ["swe_agent_patch"] },
    { node_key: "submit", job_type: "submit_pr", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["swe_agent_patch"] },
  ],
  edges: [
    { from_key: "analyze", to_key: "fix", condition: "success" },
    { from_key: "fix", to_key: "test", condition: "success" },
    { from_key: "test", to_key: "review", condition: "success" },
    { from_key: "review", to_key: "submit", condition: "success" },
  ],
};

/** Marketing: brand → copy → deck (campaign deliverables). */
const TEMPLATE_MARKETING: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "brand", job_type: "brand_compile", agent_role: "product_manager", node_type: "job" },
    { node_key: "copy", job_type: "copy_generate", agent_role: "product_manager", node_type: "job", consumes_artifact_types: ["tokens_json", "css_vars"] },
    { node_key: "deck", job_type: "deck_generate", agent_role: "product_manager", node_type: "job", consumes_artifact_types: ["copy"] },
  ],
  edges: [
    { from_key: "brand", to_key: "copy", condition: "success" },
    { from_key: "copy", to_key: "deck", condition: "success" },
  ],
};

/** Landing: copy (hero/CTA) → landing page artifact (stub or full generator). */
const TEMPLATE_LANDING: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "copy", job_type: "copy_generate", agent_role: "product_manager", node_type: "job" },
    { node_key: "landing", job_type: "landing_page_generate", agent_role: "engineer", node_type: "job", consumes_artifact_types: ["copy"] },
  ],
  edges: [
    { from_key: "copy", to_key: "landing", condition: "success" },
  ],
};

/** Email campaign: single node to generate MJML email from template + products + brand (Focuz flow). */
const TEMPLATE_EMAIL_CAMPAIGN: { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } = {
  nodes: [
    { node_key: "email_mjml", job_type: "email_generate_mjml", agent_role: "product_manager", node_type: "job" },
  ],
  edges: [],
};

const TEMPLATES: Record<string, { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] }> = {
  software: TEMPLATE_SOFTWARE,
  issue_fix: TEMPLATE_ISSUE_FIX,
  migration: TEMPLATE_MIGRATION,
  factory_ops: TEMPLATE_FACTORY_OPS,
  ci_gate: TEMPLATE_CI_GATE,
  crew: TEMPLATE_CREW,
  self_heal: TEMPLATE_SELF_HEAL,
  swe_agent: TEMPLATE_SWE_AGENT,
  marketing: TEMPLATE_MARKETING,
  landing: TEMPLATE_LANDING,
  email_design_generator: TEMPLATE_EMAIL_CAMPAIGN,
};

/** Load initiative; includes template_id when present for email_design_generator and other template-driven flows. */
export async function loadInitiative(db: DbClient, initiativeId: string): Promise<Initiative | null> {
  const fullSelect = "SELECT id, intent_type, title, risk_level, created_at, template_id FROM initiatives WHERE id = $1";
  const minimalSelect = "SELECT id, intent_type, title, risk_level, created_at FROM initiatives WHERE id = $1";
  const params = [initiativeId];

  await db.query("SAVEPOINT before_load_initiative");
  let r: { rows: Record<string, unknown>[] };
  let didRollback = false;
  try {
    r = await db.query(fullSelect, params);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "42703") {
      await db.query("ROLLBACK TO SAVEPOINT before_load_initiative");
      didRollback = true;
      r = await db.query(minimalSelect, params);
    } else {
      await db.query("ROLLBACK TO SAVEPOINT before_load_initiative").catch(() => {});
      throw err;
    }
  } finally {
    if (!didRollback) {
      await db.query("RELEASE SAVEPOINT before_load_initiative");
    }
  }

  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    intent_type: row.intent_type as string,
    title: (row.title as string | null) ?? null,
    risk_level: row.risk_level as Initiative["risk_level"],
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as Date,
    template_id: (row.template_id as string | null) ?? null,
  };
}

export async function loadPRDArtifact(_db: DbClient, _initiativeId: string): Promise<string | null> {
  return null;
}

export function computePlanHash(initiativeId: string, intentType: string, prdHashOrSeed: string): string {
  const payload = `${initiativeId}:${intentType}:${prdHashOrSeed}`;
  return createHash("sha256").update(payload).digest("hex");
}

export function decomposeToDAG(initiative: Initiative): { nodes: PlanTemplateNode[]; edges: PlanTemplateEdge[] } {
  // intent_type "email_design_generator" (legacy "email_campaign" accepted) maps to plan template "email_design_generator" (single email_mjml node).
  // initiative.template_id is the MJML template selection (e.g. UUID), not a plan template key.
  const templateId =
    initiative.intent_type === "email_design_generator" || initiative.intent_type === "email_campaign" /* backward compat */
      ? "email_design_generator"
      : (initiative.template_id ?? initiative.intent_type ?? "software");
  const t = TEMPLATES[templateId] ?? TEMPLATE_SOFTWARE;
  return { nodes: t.nodes, edges: t.edges };
}

export interface CompiledPlan {
  planId: string;
  nodeIds: Map<string, string>;
  planHash: string;
}

export async function compilePlan(
  db: DbClient,
  initiativeId: string,
  options?: { seed?: string; force?: boolean }
): Promise<CompiledPlan> {
  await db.query("SAVEPOINT before_load");
  let initiative: Initiative | null = null;
  try {
    initiative = await loadInitiative(db, initiativeId);
  } catch (err) {
    await db.query("ROLLBACK TO SAVEPOINT before_load");
    throw err;
  } finally {
    await db.query("RELEASE SAVEPOINT before_load").catch(() => {});
  }
  if (!initiative) throw new Error("Initiative not found");

  const prdHash = await loadPRDArtifact(db, initiativeId).then(c => (c ? createHash("sha256").update(c).digest("hex") : ""));
  const seed = options?.seed ?? `${initiative.created_at?.getTime() ?? Date.now()}`;
  const planHash = computePlanHash(initiativeId, initiative.intent_type, `${prdHash}:${seed}`);

  await db.query("SAVEPOINT before_existing");
  let existing: { rows: { id: string }[] };
  try {
    existing = await db.query(
      "SELECT id FROM plans WHERE initiative_id = $1 AND plan_hash = $2",
      [initiativeId, planHash]
    );
  } catch (err) {
    await db.query("ROLLBACK TO SAVEPOINT before_existing");
    throw err;
  } finally {
    await db.query("RELEASE SAVEPOINT before_existing").catch(() => {});
  }
  if (existing.rows.length > 0 && !options?.force) {
    const planId = existing.rows[0].id as string;
    let nodes: { rows: { id: string; node_key: string }[] };
    await db.query("SAVEPOINT before_existing_nodes");
    let didRollbackNodes = false;
    try {
      nodes = await db.query<{ id: string; node_key: string }>("SELECT id, node_key FROM plan_nodes WHERE plan_id = $1", [planId]);
    } catch {
      await db.query("ROLLBACK TO SAVEPOINT before_existing_nodes");
      didRollbackNodes = true;
      const minimal = await db.query<{ id: string }>("SELECT id FROM plan_nodes WHERE plan_id = $1", [planId]);
      nodes = { rows: minimal.rows.map((r, i) => ({ ...r, node_key: `node_${i}` })) };
    } finally {
      if (!didRollbackNodes) await db.query("RELEASE SAVEPOINT before_existing_nodes");
    }
    const nodeIds = new Map<string, string>();
    for (const n of nodes.rows) nodeIds.set(n.node_key, n.id);
    return { planId, nodeIds, planHash };
  }

  const { nodes: templateNodes, edges: templateEdges } = decomposeToDAG(initiative);
  const { v4: uuid } = await import("uuid");
  const planId = uuid();
  let version = 1;
  let didRollbackVersion = false;
  try {
    await db.query("SAVEPOINT before_version_select");
    try {
      const versionResult = await db.query(
        "SELECT coalesce(max(version), 0) + 1 AS v FROM plans WHERE initiative_id = $1",
        [initiativeId]
      );
      version = (versionResult.rows[0]?.v as number) ?? 1;
    } catch {
      await db.query("ROLLBACK TO SAVEPOINT before_version_select");
      didRollbackVersion = true;
    }
  } finally {
    if (!didRollbackVersion) await db.query("RELEASE SAVEPOINT before_version_select").catch(() => {});
  }

  let didRollbackPlans = false;
  try {
    await db.query("SAVEPOINT before_plans_insert");
    try {
      await db.query(
        "INSERT INTO plans (id, initiative_id, plan_hash, name, version) VALUES ($1, $2, $3, $4, $5)",
        [planId, initiativeId, planHash, initiative.title ?? null, version]
      );
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "42703") {
        await db.query("ROLLBACK TO SAVEPOINT before_plans_insert");
        didRollbackPlans = true;
        await db.query("INSERT INTO plans (id, initiative_id, plan_hash) VALUES ($1, $2, $3)", [planId, initiativeId, planHash]);
      } else throw err;
    }
  } finally {
    if (!didRollbackPlans) await db.query("RELEASE SAVEPOINT before_plans_insert").catch(() => {});
  }

  const nodeIds = new Map<string, string>();
  for (let i = 0; i < templateNodes.length; i++) {
    const tn = templateNodes[i];
    const nodeId = uuid();
    nodeIds.set(tn.node_key, nodeId);
    const sp = `before_node_${i}`;
    let didRollbackNode = false;
    try {
      await db.query(`SAVEPOINT ${sp}`);
      try {
        await db.query(
          `INSERT INTO plan_nodes (id, plan_id, node_key, job_type, node_type, agent_role, consumes_artifact_types, sequence)
           VALUES ($1, $2, $3, $4, $5::node_type, $6, $7, $8)`,
          [nodeId, planId, tn.node_key, tn.job_type, tn.node_type, tn.agent_role, tn.consumes_artifact_types ?? null, i + 1]
        );
      } catch (err: unknown) {
        if ((err as { code?: string }).code === "42703") {
          await db.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          didRollbackNode = true;
          await db.query(
            "INSERT INTO plan_nodes (id, plan_id, node_key, job_type, node_type) VALUES ($1, $2, $3, $4, $5::node_type)",
            [nodeId, planId, tn.node_key, tn.job_type, tn.node_type]
          );
        } else throw err;
      }
    } finally {
      if (!didRollbackNode) await db.query(`RELEASE SAVEPOINT ${sp}`).catch(() => {});
    }
  }

  for (const e of templateEdges) {
    const fromId = nodeIds.get(e.from_key);
    const toId = nodeIds.get(e.to_key);
    if (!fromId || !toId) continue;
    const edgeSp = `before_edge_${e.from_key}_${e.to_key}`;
    let didRollbackEdge = false;
    try {
      await db.query(`SAVEPOINT ${edgeSp}`);
      try {
        await db.query(
          "INSERT INTO plan_edges (id, plan_id, from_node_id, to_node_id, condition) VALUES ($1, $2, $3, $4, $5)",
          [uuid(), planId, fromId, toId, e.condition ?? "success"]
        );
      } catch (err: unknown) {
        if ((err as { code?: string }).code === "42703") {
          await db.query(`ROLLBACK TO SAVEPOINT ${edgeSp}`);
          didRollbackEdge = true;
          await db.query(
            "INSERT INTO plan_edges (id, plan_id, from_node_id, to_node_id) VALUES ($1, $2, $3, $4)",
            [uuid(), planId, fromId, toId]
          );
        } else throw err;
      }
    } finally {
      if (!didRollbackEdge) await db.query(`RELEASE SAVEPOINT ${edgeSp}`).catch(() => {});
    }
  }

  return { planId, nodeIds, planHash };
}
