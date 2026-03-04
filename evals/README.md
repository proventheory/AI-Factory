# Evals — Prompt CI and LLM quality gates

This folder holds **eval and regression** tooling for the AI Factory (Phase 4 of the LLM Gateway plan). See [docs/LLM_GATEWAY_AND_OPTIMIZATION.md](../docs/LLM_GATEWAY_AND_OPTIMIZATION.md).

## Contents

- **promptfoo/** — [Promptfoo](https://github.com/promptfoo/promptfoo) config for prompt CI: test suite of prompts/inputs with pass/fail; side-by-side model comparison; run in GitHub Actions on PR.
- **deepeval/** — [DeepEval](https://github.com/confident-ai/deepeval) tests for critical job types (plan_compile, code_review, triage). Run in CI.

## Running evals

### Promptfoo

```bash
# From repo root or evals/promptfoo/:
npx promptfoo@latest eval

# With gateway URL:
OPENAI_API_BASE=https://llm-gateway.onrender.com npx promptfoo@latest eval
```

### DeepEval

```bash
# From evals/deepeval/ (requires Python + pip install deepeval):
deepeval test run test_plan_compile.py test_code_review.py test_triage.py
```

## CI (GitHub Actions)

The `.github/workflows/evals.yml` workflow runs Promptfoo on PR when evals/ or prompt-related files change. It:

1. Runs `npx promptfoo@latest eval`
2. Uploads the eval report as a workflow artifact
3. Fails the job if pass rate is below threshold (default: 90%)

### Threshold

- **Promptfoo:** `PROMPTFOO_THRESHOLD=0.90` (90% of test cases must pass)
- **DeepEval:** Configured per test file; default pass threshold is 0.7 for LLM metrics

## Prompts covered

| Job type | Promptfoo | DeepEval |
|----------|-----------|----------|
| plan_compile | Yes (2 test cases) | Planned |
| code_review | Yes (2 test cases) | Planned |
| triage | Yes (2 test cases) | Planned |
| analyze_repo | Yes (1 test case) | Planned |
| codegen | Yes (1 test case) | Planned |

## Adding new prompts and tests

### Promptfoo

1. Add a new `id` and `raw` block under `prompts:` in `evals/promptfoo/promptfooconfig.yaml`.
2. Add test cases under `tests:` that reference your prompt via `prompts: [your_id]`.
3. Add assertions (`type: contains`, `type: is-json`, `type: llm-rubric`, `type: javascript`).
4. Run locally: `npx promptfoo@latest eval` to verify.
5. The CI workflow runs automatically on PR when evals/ files change.

### DeepEval

1. Create `evals/deepeval/test_<job_type>.py`.
2. Import `from deepeval import assert_test` and `from deepeval.test_case import LLMTestCase`.
3. Use `AnswerRelevancyMetric(threshold=0.7)` or `GEval(name=..., criteria=..., threshold=0.7)`.
4. Run locally: `deepeval test run test_<job_type>.py`
5. The CI workflow runs DeepEval in the `deepeval` job.

## Branch protection

To enforce evals on merge:

1. Go to GitHub repo Settings → Branches → Branch protection rules.
2. For `main` and `prod`, enable "Require status checks to pass before merging."
3. Add `promptfoo` and `deepeval` as required status checks.
4. This blocks merge when eval score is below threshold.

## Self-healing (Phase 6)

OpenHands Resolver and SWE-agent are documented in the optimization doc and in the UI debugging / self-healing plan. Gate self-healing PRs after eval gates exist. See [LLM_GATEWAY_AND_OPTIMIZATION.md](../docs/LLM_GATEWAY_AND_OPTIMIZATION.md) "Self-healing gating policy" section.
