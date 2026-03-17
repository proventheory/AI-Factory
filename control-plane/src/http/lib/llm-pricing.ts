/** $ per 1M tokens [input, output]. Order: more specific model names first. */
export const LLM_PRICING: { prefix: string; input: number; output: number }[] = [
  { prefix: "gpt-4o-mini", input: 0.15, output: 0.6 },
  { prefix: "gpt-4o", input: 2.5, output: 10 },
  { prefix: "gpt-4-turbo", input: 10, output: 30 },
  { prefix: "o1-mini", input: 3, output: 12 },
  { prefix: "o1", input: 15, output: 60 },
  { prefix: "gpt-4", input: 10, output: 30 },
  { prefix: "gpt-3.5", input: 0.5, output: 1.5 },
  { prefix: "claude-3-5-sonnet", input: 3, output: 15 },
  { prefix: "claude-3-5-haiku", input: 0.25, output: 1.25 },
  { prefix: "claude-3-opus", input: 15, output: 75 },
  { prefix: "claude-3-sonnet", input: 3, output: 15 },
  { prefix: "claude-3-haiku", input: 0.25, output: 1.25 },
  { prefix: "claude-3", input: 3, output: 15 },
  { prefix: "claude-sonnet", input: 3, output: 15 },
  { prefix: "claude-opus", input: 15, output: 75 },
  { prefix: "claude-haiku", input: 0.25, output: 1.25 },
  { prefix: "claude", input: 3, output: 15 },
];

export function llmProvider(modelId: string): "OpenAI" | "Anthropic" | "Other" {
  const id = (modelId || "").toLowerCase();
  if (id.startsWith("gpt-") || id.startsWith("o1-") || id.startsWith("o1")) return "OpenAI";
  if (id.startsWith("claude")) return "Anthropic";
  return "Other";
}

export function llmCostUsd(modelId: string, tokensIn: number, tokensOut: number): number {
  const inM = (tokensIn || 0) / 1_000_000;
  const outM = (tokensOut || 0) / 1_000_000;
  const id = (modelId || "").toLowerCase();
  for (const p of LLM_PRICING) {
    if (id.startsWith(p.prefix)) return inM * p.input + outM * p.output;
  }
  return inM * 1 + outM * 2; // default $1 / $2 per 1M
}
