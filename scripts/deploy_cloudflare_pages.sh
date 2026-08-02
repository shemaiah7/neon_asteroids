#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT:-neon-asteroids}"
BRANCH="${CLOUDFLARE_PAGES_BRANCH:-main}"
DEPLOY_DIR="${CLOUDFLARE_DEPLOY_DIR:-.cf-deploy}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Preparing Cloudflare Pages deploy directory: $DEPLOY_DIR"
./scripts/copy_three_vendor.sh
mkdir -p "$DEPLOY_DIR"

rsync -av --delete \
  --exclude '.cf-deploy/' \
  --exclude '.git/' \
  --exclude '.wrangler/' \
  --exclude 'node_modules/' \
  --exclude 'output/' \
  --exclude 'playwright_actions/' \
  --exclude 'scripts/' \
  ./ "$DEPLOY_DIR/"

BUILD_ID="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)$(git diff --quiet 2>/dev/null || echo '-dirty')"
BUILD_DATE="$(date +%Y-%m-%d)"
echo "Stamping build $BUILD_ID ($BUILD_DATE) into $DEPLOY_DIR/src/version.js"
cat > "$DEPLOY_DIR/src/version.js" <<VERSIONJS
export const VERSION = "${BUILD_ID} (${BUILD_DATE})";
VERSIONJS

echo "Deploying to Cloudflare Pages project '$PROJECT_NAME' on branch '$BRANCH'..."
npx wrangler pages deploy "$DEPLOY_DIR" --project-name "$PROJECT_NAME" --branch "$BRANCH"

