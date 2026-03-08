/**
 * Intent types that map to plan templates in control-plane/src/plan-compiler.ts.
 * Used by Create/Edit initiative flows so users pick a pipeline type.
 */

export const INTENT_TYPES = [
  { value: "software", label: "Software (PRD → design → code → test → review)" },
  { value: "issue_fix", label: "Issue fix (analyze → patch → test → PR)" },
  { value: "marketing", label: "Marketing (brand → copy → deck)" },
  { value: "email_design_generator", label: "Email design generator (brand → products → template → generate)" },
  { value: "landing", label: "Landing page (copy → landing page)" },
  { value: "migration", label: "Migration (analyze → plan → apply → validate)" },
  { value: "factory_ops", label: "Factory ops (review → codegen → patch)" },
  { value: "ci_gate", label: "CI gate (code review → QA validator)" },
  { value: "crew", label: "Crew (research → design → codegen → test)" },
  { value: "self_heal", label: "Self-heal (analyze → resolve → review → PR)" },
  { value: "swe_agent", label: "SWE agent (analyze → swe_agent → test → review → PR)" },
] as const;

export type IntentTypeValue = (typeof INTENT_TYPES)[number]["value"];
