#!/usr/bin/env bash
#
# Rebuild, repack, and reinstall @mind-studio/core into every sibling prototype
# that declares it as a dependency.
#
# Why this script exists: Next.js 16 + Turbopack rejects `file:` deps whose
# symlink target sits outside the consumer's project root, so we ship a
# packed tarball instead. Every change to the shared package needs build →
# pack → install across every consumer; this script does all three.
#
# Usage:  ./scripts/sync.sh

set -euo pipefail

cd "$(dirname "$0")/.."
PKG_DIR="$(pwd)"
SIBLINGS_DIR="$(cd .. && pwd)"

echo "→ Building @mind-studio/core"
npm run build --silent

echo "→ Packing tarball"
rm -f mind-studio-core-*.tgz
npm pack --pack-destination . --silent >/dev/null
TGZ_NAME="$(ls -1 mind-studio-core-*.tgz | head -n 1)"
TGZ_PATH="$PKG_DIR/$TGZ_NAME"
echo "  → $TGZ_NAME"

count=0
for dir in "$SIBLINGS_DIR"/*/; do
  name="$(basename "$dir")"
  pkg="$dir/package.json"
  [ -f "$pkg" ] || continue
  [ "$name" = "core" ] && continue
  grep -q '"@mind-studio/core"' "$pkg" || continue
  echo "→ Installing into $name"
  (
    cd "$dir"
    # Use a relative path so package.json stays portable across machines.
    npm install "../core/$TGZ_NAME" --no-audit --no-fund --silent
  )
  count=$((count + 1))
done

echo "Done — synced $count consumer(s)."
