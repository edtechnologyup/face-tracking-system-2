#!/bin/bash
mkdir -p public/models
cd public/models

BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

FILES=(
  "tiny_face_detector_model-weights_manifest.json"
  "tiny_face_detector_model-shard1"
  "face_landmark_68_model-weights_manifest.json"
  "face_landmark_68_model-shard1"
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model-shard1"
  "face_recognition_model-shard2"
)

for file in "${FILES[@]}"; do
  echo "Downloading $file..."
  curl -s -L -o "$file" "$BASE_URL/$file"
done

echo "Done"

echo "Downloading L2CS-Net ONNX (Quadric int8, ~24MB)..."
curl -sL -o "l2cs-net-448.onnx" "https://sdk-cli-models.s3.us-east-2.amazonaws.com/l2csnet-sim_opt_asym_int8_q.onnx"
echo "L2CS model saved to public/models/l2cs-net-448.onnx"
