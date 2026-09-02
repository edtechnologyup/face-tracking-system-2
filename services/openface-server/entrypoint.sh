#!/bin/sh
set -e

mkdir -p "$OPENFACE_WEIGHTS_DIR"

if [ ! -f "$OPENFACE_WEIGHTS_DIR/Alignment_RetinaFace.pth" ] \
  || [ ! -f "$OPENFACE_WEIGHTS_DIR/MTL_backbone.pth" ] \
  || [ ! -f "$OPENFACE_WEIGHTS_DIR/mobilenetV1X0.25_pretrain.tar" ]; then
  echo "Downloading OpenFace 3.0 weights from Hugging Face..."
  python /app/scripts/download_weights.py || echo "Warning: weight download failed — mount weights to $OPENFACE_WEIGHTS_DIR"
fi

PORT="${PORT:-8080}"

exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
