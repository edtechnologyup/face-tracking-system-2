#!/bin/sh
set -e

mkdir -p "$OPENFACE_WEIGHTS_DIR"

if [ ! -f "$OPENFACE_WEIGHTS_DIR/Alignment_RetinaFace.pth" ]; then
  echo "Downloading OpenFace 3.0 weights..."
  openface download || echo "Warning: openface download failed — mount weights to $OPENFACE_WEIGHTS_DIR"
fi

PORT="${PORT:-8080}"

exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
