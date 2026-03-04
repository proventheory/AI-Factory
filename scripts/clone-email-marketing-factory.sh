#!/usr/bin/env bash
# Clone the Email Marketing Factory app (source: CULTURA-AI) into email-marketing-factory/
# Run from repo root: ./scripts/clone-email-marketing-factory.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="${REPO_ROOT}/email-marketing-factory"
SOURCE_REPO="https://github.com/cultura-company/CULTURA-AI.git"

if [[ -d "$TARGET_DIR" && -f "$TARGET_DIR/package.json" ]]; then
  echo "email-marketing-factory/ already exists (package.json present). Skip clone."
  exit 0
fi

if [[ -d "$TARGET_DIR" ]]; then
  echo "Directory email-marketing-factory/ exists but is not the app. Remove it or use a different path."
  exit 1
fi

echo "Cloning Email Marketing Factory from $SOURCE_REPO into email-marketing-factory/ ..."
git clone "$SOURCE_REPO" "$TARGET_DIR"
echo "Done. Next: cd email-marketing-factory && pnpm install && pnpm dev"
echo "See docs/EMAIL_MARKETING_FACTORY_INTEGRATION.md for integration steps."
