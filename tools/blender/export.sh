#!/usr/bin/env bash
# Track A, step A4: optimise the raw glb for the web.
# Usage: tools/blender/export.sh assets-src/engine-raw.glb [version]
# Writes web/public/models/engine-v<version>.glb and engine-v<version>-mobile.glb.
# Versioned filenames only. Never overwrite an existing version in place.
set -euo pipefail

SRC="${1:?path to engine-raw.glb}"
VER="${2:-1}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/web/public/models"
GT="$ROOT/web/node_modules/.bin/gltf-transform"
mkdir -p "$OUT_DIR"

DESKTOP="$OUT_DIR/engine-v$VER.glb"
MOBILE="$OUT_DIR/engine-v$VER-mobile.glb"
for f in "$DESKTOP" "$MOBILE"; do
  if [[ -e "$f" ]]; then
    echo "refusing to overwrite $f. Bump the version." >&2
    exit 1
  fi
done

echo "== desktop (2k textures, draco) =="
"$GT" optimize "$SRC" "$DESKTOP" \
  --compress draco \
  --texture-compress webp \
  --texture-size 2048 \
  --simplify false

echo "== mobile (1k textures, draco, simplified) =="
"$GT" optimize "$SRC" "$MOBILE" \
  --compress draco \
  --texture-compress webp \
  --texture-size 1024 \
  --simplify true --simplify-ratio 0.4

echo "== report =="
"$GT" inspect "$DESKTOP" | head -60
ls -la "$DESKTOP" "$MOBILE"

echo
echo "Node-name contract check:"
"$GT" inspect "$DESKTOP" --format csv 2>/dev/null | grep -E "Crank|Cyl_[1-8]_(Piston|Rod)|Block|HeadL|HeadR" | wc -l | xargs -I{} echo "  {} of 20 contract nodes found"
echo "Draco decoder: copy from web/node_modules/three/examples/jsm/libs/draco/gltf/ to web/public/draco/ (Track B does this)."
