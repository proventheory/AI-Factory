# Slop Guard and Quality Gates

Inspired by [macaron-software/software-factory](https://github.com/macaron-software/software-factory) (Quality Factory Line, Adversarial Slop Guard).

## Quality Factory Line

Quality as an industrial line: run deterministic tools across dimensions, then apply phase-based gates (PASS/FAIL). No LLM required for pass/fail.

### Config

`config/quality_dimensions.yaml` defines:
- **Dimensions**: each with id, name, phase, tool, threshold, score_expression
- **Gates**: group dimensions into named checkpoints (e.g. `code_quality`, `test_quality`, `security`, `release_ready`)

### Dimensions

| Dimension | Tool | Phase | Threshold |
|---|---|---|---|
| complexity | radon/lizard | codegen | max avg 10 |
| coverage | coverage.py/istanbul | unit_test | min 80% |
| static_analysis | semgrep/bandit | codegen | 0 errors |
| test_pass_rate | test_runner | unit_test | 100% |
| lint | eslint/ruff | codegen | 0 errors |
| type_check | tsc/mypy | codegen | 0 errors |
| dependency_audit | npm audit | codegen | 0 high vulns |
| accessibility | pa11y/axe | code_review | 0 errors |
| bundle_size | size-limit | codegen | max 500KB |
| circular_deps | madge | codegen | 0 circular |

### Gates

| Gate | Phase | Dimensions | Rule |
|---|---|---|---|
| code_quality | codegen | complexity, static_analysis, lint, type_check, circular_deps | all_pass |
| test_quality | unit_test | coverage, test_pass_rate | all_pass |
| security | codegen | static_analysis, dependency_audit | all_pass |
| release_ready | release | all dimensions | all_pass |

### Runner

`runners/src/validators/quality-gate.ts` reads config, runs tools (stubs for now), writes to `validations` table. Handler registered as job_type `quality_gate`.

## Adversarial Slop Guard

Two-layer guard that blocks placeholder/hallucinated output.

### L0: Deterministic (cheap, fast)

Regex, AST, and policy rules. Config: `config/slop_guard.yaml`.

| Rule | Type | What it catches |
|---|---|---|
| no_todo_placeholder | regex | TODO, FIXME, HACK, XXX, PLACEHOLDER |
| no_not_implemented | regex | NotImplementedError, "not implemented" |
| no_tbd | regex | TBD |
| no_lorem_ipsum | regex | Lorem ipsum |
| no_fake_urls | regex | example.com, placeholder URLs |
| no_empty_functions | regex | Empty function bodies (pass, {}) |
| no_hardcoded_secrets | regex | API keys (sk-, AKIA, ghp_), passwords |
| no_console_log_spam | regex | Excessive console.log (>5) |
| no_stack_mismatch | policy | Wrong framework imports (Vue in React project) |
| min_content_length | policy | Suspiciously short output (<50 chars) |

If any `force_reject` rule matches -> immediate fail, skip L1.

### L1: Semantic Judge (LLM, only when L0 passes)

Calls LLM (FAST tier) to score artifact 0-10. Score below 6 = fail. Reduces token burn by only running when L0 doesn't already reject.

### Runner

`runners/src/validators/slop-guard.ts` reads config, runs L0/L1, writes to `validations` table (validator_type `slop_guard_l0` / `slop_guard_l1`). Handler registered as job_type `slop_guard`.

### Integration

After an executor produces artifacts, a `slop_guard` validator node runs in the plan DAG. If it fails, the run can block or retry (existing scheduler behavior).

## Memory Layers (Bonus)

Convention for `agent_memory.scope`:
- **session** = run_id (ephemeral)
- **pattern** = initiative_id + "pattern" (learned patterns)
- **project** = initiative_id + "project" (project context)
- **global** = null / "global" (cross-project)

Config: `config/context_loader.yaml` defines auto-loaded files per job_type.
