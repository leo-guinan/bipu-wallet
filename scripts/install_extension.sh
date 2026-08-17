#!/usr/bin/env bash
# install_extension.sh — clone (or update) the bipu-wallet repo to a stable local
# folder and print the path to load as an unpacked Chrome extension.
#
# Agent-friendly: a Claude/Hermes/Codex agent can run this to handle the git
# part and then point the user at the printed folder for "Load unpacked".
#
# Usage:
#   ./scripts/install_extension.sh                  # clone to ~/bipu-wallet (default)
#   ./scripts/install_extension.sh ~/my/extensions  # clone into this parent dir
#
# Idempotent: if the target already exists it does a git pull instead of cloning.

set -euo pipefail

REPO_URL="https://github.com/leo-guinan/bipu-wallet.git"
DEFAULT_PARENT="$HOME"

parent="${1:-$DEFAULT_PARENT}"
target="$parent/bipu-wallet"

echo "== bipu-wallet install helper =="
echo "repo : $REPO_URL"
echo "target: $target"

if [ -d "$target/.git" ]; then
  echo "== directory exists — pulling latest =="
  git -C "$target" pull --ff-only
else
  echo "== cloning =="
  mkdir -p "$parent"
  git clone "$REPO_URL" "$target"
fi

echo ""
echo "== DONE =="
echo ""
echo "To install as an unpacked Chrome extension:"
echo "  1. Open chrome://extensions"
echo "  2. Enable 'Developer mode' (top-right toggle)"
echo "  3. Click 'Load unpacked'"
echo "  4. Select this folder:  $target"
echo ""
echo "Note: this folder is the extension root (contains manifest.json)."
echo "Verify it:  ls \"$target/manifest.json\""
ls "$target/manifest.json" >/dev/null && echo "manifest.json present — folder is install-ready."
