#!/bin/bash
mkdir -p public/models
cd public/models

BASE_URL="https://unpkg.com/@vladmandic/face-api@1.7.12/model"

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
