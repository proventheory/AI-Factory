#!/usr/bin/env bash
# Vercel "Ignored Build Step": only build when console or its deps change.
# Exit 0 = skip build (save $$). Exit 1 = run build.
# In Vercel: Settings → General → Build & Development Settings → Ignored Build Step:
#   bash scripts/vercel-ignore-build-step.sh
# (If Root Directory is "console", use: bash ../scripts/vercel-ignore-build-step.sh)

set -e
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# First deploy or no previous SHA → always build
if [ -z "${VERCEL_GIT_PREVIOUS_SHA}" ] || [ "${VERCEL_GIT_PREVIOUS_SHA}" = "0000000000000000000000000000000000000000" ]; then
  exit 1
fi

# Build only if console/ or packages/ (e.g. @ai-factory/ui) changed
if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- console/ packages/ 2>/dev/null; then
  exit 0
fi
exit 1
