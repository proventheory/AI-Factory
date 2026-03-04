#!/usr/bin/env bash
# Doctor: deterministic health check for the AI Factory monorepo.
# Per-workspace, timed, structured JSON output.
# Usage: bash scripts/doctor.sh [--json] [--step STEP]

JSON_MODE=false
STEP_FILTER="all"

for arg in "$@"; do
  case "$arg" in
    --json) JSON_MODE=true ;;
    --step) : ;; # value follows
    *) if [[ "${PREV_ARG:-}" == "--step" ]]; then STEP_FILTER="$arg"; fi ;;
  esac
  PREV_ARG="$arg"
done

RESULTS_FILE=$(mktemp)
echo '[]' > "$RESULTS_FILE"

add_result() {
  local step="$1" workspace="$2" success="$3" duration_ms="$4" output_file="$5"
  python3 -c "
import json, sys
output = open('$output_file').read()[:50000]
with open('$RESULTS_FILE') as f: results = json.load(f)
results.append({
  'step': '$step',
  'workspace': '$workspace',
  'success': True if '$success' == 'true' else False,
  'duration_ms': $duration_ms,
  'output': output
})
with open('$RESULTS_FILE', 'w') as f: json.dump(results, f)
" 2>/dev/null || true
}

run_check() {
  local step="$1" workspace="$2" cmd="$3" workdir="${4:-.}"
  if [[ "$STEP_FILTER" != "all" && "$STEP_FILTER" != "$step" ]]; then return 0; fi

  local start_s end_s duration_ms exit_code=0
  start_s=$(date +%s)
  local output_file
  output_file=$(mktemp)

  (cd "$workdir" && eval "$cmd" > "$output_file" 2>&1) || exit_code=$?

  end_s=$(date +%s)
  duration_ms=$(( (end_s - start_s) * 1000 ))

  local success="true"
  if [[ $exit_code -ne 0 ]]; then success="false"; fi

  add_result "$step" "$workspace" "$success" "$duration_ms" "$output_file"

  if [[ "$JSON_MODE" == "false" ]]; then
    if [[ "$success" == "true" ]]; then
      echo "  [PASS] $workspace:$step (${duration_ms}ms)"
    else
      echo "  [FAIL] $workspace:$step (${duration_ms}ms)"
      cat "$output_file" | tail -20
    fi
  fi

  rm -f "$output_file"
  return $exit_code
}

if [[ "$JSON_MODE" == "false" ]]; then
  echo "Doctor: checking monorepo health..."
  echo ""
fi

FIRST_FAILURE=""

# Step 1: Root tsc
run_check "tsc" "root" "npx tsc --noEmit" "." || FIRST_FAILURE="${FIRST_FAILURE:-root:tsc}"

# Step 2: Console lint (skip if no .eslintrc — next lint will prompt interactively)
if [[ "$STEP_FILTER" == "all" || "$STEP_FILTER" == "lint" ]]; then
  if [[ -f "console/.eslintrc.json" || -f "console/.eslintrc.js" || -f "console/eslint.config.js" ]]; then
    run_check "lint" "console" "npx next lint --format json" "console" || FIRST_FAILURE="${FIRST_FAILURE:-console:lint}"
  else
    if [[ "$JSON_MODE" == "false" ]]; then echo "  [SKIP] console:lint (no eslint config)"; fi
  fi
fi

# Step 3: Console build
if [[ "$STEP_FILTER" == "all" || "$STEP_FILTER" == "build" ]]; then
  run_check "build" "console" "NEXT_PUBLIC_CONTROL_PLANE_API=http://localhost:3001 npx next build" "console" || FIRST_FAILURE="${FIRST_FAILURE:-console:build}"
fi

# Step 4: Root tests
run_check "test" "root" "npx tsx --test runners/tests/*.test.ts scripts/optimizer.test.ts" "." || FIRST_FAILURE="${FIRST_FAILURE:-root:test}"

# JSON output
if [[ "$JSON_MODE" == "true" ]]; then
  python3 -c "
import json
with open('$RESULTS_FILE') as f: results = json.load(f)
failed = [r for r in results if not r['success']]
status = 'pass' if not failed else 'fail'
failed_step = failed[0]['workspace'] + ':' + failed[0]['step'] if failed else None
print(json.dumps({
  'status': status,
  'failed_step': failed_step,
  'results': results,
  'total_errors': len(failed)
}, indent=2))
" 2>/dev/null
else
  echo ""
  if [[ -z "$FIRST_FAILURE" ]]; then
    echo "Doctor: ALL CHECKS PASSED"
  else
    echo "Doctor: FAILED at $FIRST_FAILURE"
  fi
fi

rm -f "$RESULTS_FILE"

if [[ -n "$FIRST_FAILURE" ]]; then exit 1; fi
exit 0
