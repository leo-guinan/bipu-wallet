#!/usr/bin/env bash
# package_extension.sh — build a clean, distributable .zip of the BIPU Wallet
# extension runtime. Ships ONLY the files the browser needs at runtime; excludes
# data/, node_modules/, collector/, tests, and dev-only files.
#
# Usage:
#   ./scripts/package_extension.sh [out_dir]
#
# Output: <out_dir>/bipu-wallet-<version>.zip  (default out_dir = ./dist)
# Prints a receipt with the file list, sizes, and checksum.

set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
REPO_ROOT="$(pwd)"
VERSION="$(jq -r .version manifest.json)"
OUT_DIR="${1:-$REPO_ROOT/dist}"
STAGE="$(mktemp -d /tmp/bipu-wallet-pkg.XXXXXX)"
ZIP_NAME="bipu-wallet-${VERSION}.zip"

echo "== BIPU Wallet packaging =="
echo "version : $VERSION"
echo "output  : $OUT_DIR/$ZIP_NAME"

# --- runtime file set (exactly what the browser loads at runtime) ---
RUNTIME_FILES=(
  manifest.json
  background.js
  bridge.js
  popup.html
  popup.css
  popup.js
  injected/phantom-main.js
  injected/web3-bundle.js
  lib/bipu-wallet.js
  lib/bot-fingerprint.js
  content/known-labels.js
  content/bot-indicator.js
)

# --- 1. syntax + manifest checks before staging ---
echo "== checks =="
for f in background.js popup.js bridge.js injected/phantom-main.js lib/bipu-wallet.js lib/bot-fingerprint.js content/bot-indicator.js content/known-labels.js; do
  node --check "$f" >/dev/null 2>&1 && echo "  OK $f" || { echo "  SYNTAX FAIL $f"; exit 1; }
done
python3 -m json.tool manifest.json >/dev/null && echo "  OK manifest.json"
echo "  runtime file count: ${#RUNTIME_FILES[@]}"

# --- 2. stage exactly the runtime files ---
echo "== staging =="
for f in "${RUNTIME_FILES[@]}"; do
  [ -f "$f" ] || { echo "  MISSING $f"; exit 1; }
  mkdir -p "$STAGE/$(dirname "$f")"
  cp "$f" "$STAGE/$f"
done

# --- 3. verify nothing forbidden staged ---
echo "== integrity scan =="
FORBIDDEN_PATTERNS='(^|/)(data|node_modules|collector|\.git|scripts|lib/test-|eval-|test-)'
STAGED_BAD="$(cd "$STAGE" && find . -type f | grep -E "$FORBIDDEN_PATTERNS" || true)"
if [ -n "$STAGED_BAD" ]; then
  echo "  FORBIDDEN FILES IN STAGE:"; echo "$STAGED_BAD"; exit 1
fi
SECRET_HITS="$(cd "$STAGE" && grep -rlE "sk_live_|sk_test_|whsec_|BEGIN.*PRIVATE|STRIPE_|AWS_SECRET|api[_-]?key[[:space:]]*=[[:space:]]*['\"][A-Za-z0-9]{20,}" . 2>/dev/null || true)"
if [ -n "$SECRET_HITS" ]; then
  echo "  SECRETS IN STAGE:"; echo "$SECRET_HITS"; exit 1
fi
# Real-credential scan done. `secretKey` in the pinned web3 bundle is the Solana
# SDK's own variable name (P.secretKey), verified as library code, not a secret.
echo "  integrity scan clean"

# --- 4. build zip ---
mkdir -p "$OUT_DIR"
(cd "$STAGE" && zip -rq "$OUT_DIR/$ZIP_NAME" .)
SIZE="$(du -h "$OUT_DIR/$ZIP_NAME" | cut -f1)"
SHA="$(shasum -a 256 "$OUT_DIR/$ZIP_NAME" | cut -d' ' -f1)"
echo "== done =="
echo "  zip   : $OUT_DIR/$ZIP_NAME ($SIZE)"
echo "  sha256: $SHA"

# --- 5. receipt ---
cat > "$OUT_DIR/package_receipt.json" <<JSON
{
  "artifact": "$ZIP_NAME",
  "version": "$VERSION",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "size_bytes": "$(wc -c < "$OUT_DIR/$ZIP_NAME")",
  "sha256": "$SHA",
  "files": [$(printf '"%s",' "${RUNTIME_FILES[@]}" | sed 's/,$//')],
  "excluded": ["data/", "node_modules/", "collector/", "scripts/", "tests", "dev-only"]
}
JSON
echo "  receipt: $OUT_DIR/package_receipt.json"

rm -rf "$STAGE"
