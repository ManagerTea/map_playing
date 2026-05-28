#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PKG_NAME="map-helper-server"
TARGET="$DIST_DIR/${PKG_NAME}.zip"

mkdir -p "$DIST_DIR"
rm -f "$TARGET"

cd "$ROOT_DIR"
zip -r "$TARGET" \
  index.html styles.css app.js server.js package.json .npmrc README.md \
  Dockerfile docker-compose.yml >/dev/null

echo "Created: $TARGET"
