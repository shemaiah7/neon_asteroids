#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p vendor/three/jsm
cp node_modules/three/build/three.module.js node_modules/three/build/three.core.js vendor/three/
rsync -a --delete node_modules/three/examples/jsm/ vendor/three/jsm/