/**
 * Error baseline: snapshot current errors so self-healer skips pre-existing issues.
 * Run: npx tsx scripts/baseline.ts
 * Output: .self-heal-baseline.json
 */

import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

export interface ErrorFingerprint {
  file: string;
  line: number;
  code: string;
  message_hash: string;
}

export interface Baseline {
  generated_at: string;
  fingerprints: ErrorFingerprint[];
}

const BASELINE_PATH = ".self-heal-baseline.json";

function hashMessage(msg: string): string {
  return createHash("sha256").update(msg).digest("hex").slice(0, 12);
}

function parseTscErrors(output: string): ErrorFingerprint[] {
  const fps: ErrorFingerprint[] = [];
  const regex = /^(.+?)\((\d+),\d+\):\s+error\s+(TS\d+):\s+(.+)$/gm;
  let m;
  while ((m = regex.exec(output)) !== null) {
    fps.push({
      file: m[1],
      line: parseInt(m[2], 10),
      code: m[3],
      message_hash: hashMessage(m[4]),
    });
  }
  return fps;
}

export function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) as Baseline;
  } catch {
    return null;
  }
}

export function isBaselineError(fp: ErrorFingerprint, baseline: Baseline): boolean {
  return baseline.fingerprints.some(
    (b) => b.file === fp.file && b.code === fp.code && b.message_hash === fp.message_hash
  );
}

export function generateBaseline(): Baseline {
  let tscOutput = "";
  try {
    execSync("npx tsc --noEmit 2>&1", { encoding: "utf-8", cwd: process.cwd() });
  } catch (e) {
    tscOutput = (e as { stdout?: string; stderr?: string }).stdout ?? "";
    if (!tscOutput) tscOutput = (e as { stderr?: string }).stderr ?? "";
  }

  const fingerprints = parseTscErrors(tscOutput);

  const baseline: Baseline = {
    generated_at: new Date().toISOString(),
    fingerprints,
  };

  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log(`[baseline] Written ${fingerprints.length} error fingerprints to ${BASELINE_PATH}`);
  return baseline;
}

if (process.argv[1]?.endsWith("baseline.ts")) {
  generateBaseline();
}
