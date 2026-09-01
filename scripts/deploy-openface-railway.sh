#!/usr/bin/env bash
# Deploy OpenFace 3.0 service to Railway.
# Run from repo root: ./scripts/deploy-openface-railway.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_DIR="$ROOT/services/openface-server"

run_railway() {
  if command -v railway >/dev/null 2>&1; then
    railway "$@"
    return
  fi
  npx --yes @railway/cli "$@"
}

if ! run_railway whoami >/dev/null 2>&1; then
  echo "Railway CLI not logged in."
  echo "  curl -fsSL https://railway.com/install.sh | sh"
  echo "  railway login"
  exit 1
fi

cd "$SERVICE_DIR"

echo "Link project (skip if already linked in this folder)..."
run_railway link || true

echo "Setting env vars..."
run_railway variables set OPENFACE_DEVICE=cpu OPENFACE_WEIGHTS_DIR=/app/weights

echo "Deploying (Dockerfile in services/openface-server)..."
run_railway up --detach

echo ""
echo "Next:"
echo "  cd services/openface-server && railway domain"
echo "  Set OPENFACE_SERVICE_URL on Vercel/local to the Railway HTTPS URL"
echo "  Railway dashboard → Resources → increase Memory to 4 GB+"
