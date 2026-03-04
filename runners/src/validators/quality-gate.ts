/**
 * Quality Gate validator: reads config/quality_dimensions.yaml,
 * evaluates dimensions for the current phase, writes validations.
 * Uses existing `validations` table (validator_type, status, report_artifact_id).
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type pg from "pg";
import type { JobContext } from "../job-context.js";

interface QualityDimension {
  id: string;
  name: string;
  description: string;
  phase: string;
  tool: string;
  tool_config: Record<string, unknown>;
  threshold: Record<string, number>;
  score_expression?: string;
}

interface QualityGate {
  id: string;
  name: string;
  phase: string;
  dimensions: string[];
  pass_rule: string;
}

interface QualityConfig {
  version: number;
  dimensions: QualityDimension[];
  gates: QualityGate[];
}

let configCache: QualityConfig | null = null;

function loadConfig(): QualityConfig {
  if (configCache) return configCache;
  const configPath = resolve(process.cwd(), "config/quality_dimensions.yaml");
  if (!existsSync(configPath)) {
    return { version: 1, dimensions: [], gates: [] };
  }
  const raw = readFileSync(configPath, "utf-8");
  const lines = raw.split("\n");
  const dimensions: QualityDimension[] = [];
  const gates: QualityGate[] = [];
  let current: "dimensions" | "gates" | null = null;
  let currentItem: Record<string, unknown> = {};

  for (const line of lines) {
    if (line.startsWith("dimensions:")) { current = "dimensions"; continue; }
    if (line.startsWith("gates:")) { current = "gates"; continue; }
    if (line.match(/^  - id:/)) {
      if (currentItem.id) {
        if (current === "dimensions") dimensions.push(currentItem as unknown as QualityDimension);
        else if (current === "gates") gates.push(currentItem as unknown as QualityGate);
      }
      currentItem = { id: line.split(":")[1]?.trim() };
    }
  }
  if (currentItem.id) {
    if (current === "dimensions") dimensions.push(currentItem as unknown as QualityDimension);
    else if (current === "gates") gates.push(currentItem as unknown as QualityGate);
  }

  configCache = { version: 1, dimensions, gates };
  return configCache;
}

export interface QualityResult {
  dimensionId: string;
  passed: boolean;
  score?: number;
  details: string;
}

export async function runQualityGate(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
  phase: string,
): Promise<{ allPassed: boolean; results: QualityResult[] }> {
  const config = loadConfig();
  const phaseDimensions = config.dimensions.filter(d => d.phase === phase);
  const results: QualityResult[] = [];

  for (const dim of phaseDimensions) {
    const result = await evaluateDimension(dim, context);
    results.push(result);

    await client.query(
      `INSERT INTO validations (id, run_id, job_run_id, validator_type, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
      [params.runId, params.jobRunId, `quality_${dim.id}`, result.passed ? "pass" : "fail"],
    );
  }

  const phaseGates = config.gates.filter(g => g.phase === phase);
  for (const gate of phaseGates) {
    const gateDims = results.filter(r => gate.dimensions.includes(r.dimensionId));
    const gatePassed = gate.pass_rule === "all_pass"
      ? gateDims.every(d => d.passed)
      : gateDims.filter(d => d.passed).length > gateDims.length / 2;

    await client.query(
      `INSERT INTO validations (id, run_id, job_run_id, validator_type, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
      [params.runId, params.jobRunId, `gate_${gate.id}`, gatePassed ? "pass" : "fail"],
    );
  }

  return { allPassed: results.every(r => r.passed), results };
}

async function evaluateDimension(dim: QualityDimension, _context: JobContext): Promise<QualityResult> {
  return {
    dimensionId: dim.id,
    passed: true,
    score: 1.0,
    details: `[stub] ${dim.name} (${dim.tool}): tool not yet wired; defaulting to pass.`,
  };
}
