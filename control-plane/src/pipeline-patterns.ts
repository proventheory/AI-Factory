/**
 * Pattern registry of composable pipeline modules (not "templates 2.0").
 * Defines: pattern key, required/optional inputs, node modules, edge rules.
 * Used to produce PipelineDraft; registry is not runtime truth. See docs/PIPELINE_GENERATION.md §3.3.
 */

import { getTemplateByIntentType } from "./plan-compiler.js";
import type { PipelineDraftNode, PipelineDraftEdge } from "./pipeline-draft.js";

export const PIPELINE_PATTERN_IDS = ["seo_migration_audit", "email_design_generator", "self_heal", "software_deploy"] as const;

export type PipelinePatternId = (typeof PIPELINE_PATTERN_IDS)[number];

/** Required input keys per pattern (for validation and draft enrichment). */
export const PATTERN_REQUIRED_INPUTS: Record<string, string[]> = {
  seo_migration_audit: ["initiative_id"],
  email_design_generator: ["initiative_id", "template_id"],
  self_heal: ["initiative_id"],
  software_deploy: ["initiative_id"],
};

/** Human-readable labels for pattern inputs (for UI and prompt extraction). */
export const PATTERN_INPUT_LABELS: Record<string, Record<string, string>> = {
  seo_migration_audit: { initiative_id: "Initiative", source_platform: "Source platform", target_platform: "Target platform" },
  email_design_generator: { initiative_id: "Initiative", template_id: "Email template" },
  self_heal: { initiative_id: "Initiative" },
  software_deploy: { initiative_id: "Initiative", environment: "Environment" },
};

/** Success criteria per pattern (for draft.successCriteria and lint). */
export const PATTERN_SUCCESS_CRITERIA: Record<string, string[]> = {
  seo_migration_audit: ["Audit report generated", "URL mapping and redirect verification complete"],
  email_design_generator: ["MJML email artifact produced", "Template contract satisfied"],
  self_heal: ["Patch applied and PR submitted", "Tests passing"],
  software_deploy: ["Migration guard passed", "Build succeeded", "Preview deploy healthy", "Smoke test passed"],
};

export function getPattern(intentType: string): {
  nodes: PipelineDraftNode[];
  edges: PipelineDraftEdge[];
  required_inputs: string[];
  input_labels?: Record<string, string>;
  success_criteria?: string[];
} | null {
  const t = getTemplateByIntentType(intentType);
  if (!t) return null;
  const nodes: PipelineDraftNode[] = t.nodes.map((n: any) => ({
    node_key: n.node_key,
    job_type: n.job_type,
    node_type: n.node_type,
    agent_role: n.agent_role,
    consumes_artifact_types: n.consumes_artifact_types,
  }));
  const edges: PipelineDraftEdge[] = t.edges.map((e: any) => ({
    from_key: e.from_key,
    to_key: e.to_key,
    condition: e.condition,
  }));
  return {
    nodes,
    edges,
    required_inputs: PATTERN_REQUIRED_INPUTS[intentType] ?? [],
    input_labels: PATTERN_INPUT_LABELS[intentType],
    success_criteria: PATTERN_SUCCESS_CRITERIA[intentType],
  };
}
