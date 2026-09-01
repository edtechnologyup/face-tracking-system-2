#!/usr/bin/env bash
# Deploy OpenFace 3.0 to Fly.io (region: sin).
# Auth (pick one):
#   fly auth login
#   export FLY_API_TOKEN=$(fly tokens create deploy -x 999999h)
set -euo pipefail

export PATH="${HOME}/.fly/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/services/openface-server"

if ! command -v fly >/dev/null 2>&1; then
  echo "Installing flyctl..."
  curl -L https://fly.io/install.sh | sh
  export PATH="${HOME}/.fly/bin:${PATH}"
fi

if ! fly auth whoami >/dev/null 2>&1; then
  echo "Not logged in."
  echo "  Option A: fly auth login"
  echo "  Option B: export FLY_API_TOKEN=\$(fly tokens create deploy -x 999999h)"
  exit 1
fi

APP_NAME="${FLY_APP_NAME:-face-tracking-openface}"
REGION="${FLY_REGION:-sin}"

if ! fly status -a "$APP_NAME" >/dev/null 2>&1; then
  echo "Creating Fly app: $APP_NAME ($REGION)..."
  fly apps create "$APP_NAME" --org personal 2>/dev/null || fly apps create "$APP_NAME"
  fly config save -a "$APP_NAME" --yes 2>/dev/null || true
fi

if ! fly volumes list -a "$APP_NAME" 2>/dev/null | grep -q openface_weights; then
  echo "Creating volume openface_weights (1GB, $REGION)..."
  fly volumes create openface_weights --region "$REGION" --size 1 -a "$APP_NAME" --yes
fi

if ! grep -q '^\[mounts\]' fly.toml; then
  echo "Enabling weights volume mount in fly.toml..."
  cat >> fly.toml <<'EOF'

[mounts]
  source = "openface_weights"
  destination = "/app/weights"
EOF
fi

if [ -n "${OPENFACE_API_KEY:-}" ]; then
  fly secrets set OPENFACE_API_KEY="$OPENFACE_API_KEY" -a "$APP_NAME"
fi

echo "Deploying $APP_NAME (first deploy may take 15–20 min)..."
fly deploy -a "$APP_NAME"

HOST="$(fly info -a "$APP_NAME" --json | python3 -c 'import sys,json; print(json.load(sys.stdin)["Hostname"])')"
echo ""
echo "Deployed: https://${HOST}"
echo "Health:   curl https://${HOST}/health"
echo ""
echo "Add to Next.js / Vercel:"
echo "  OPENFACE_SERVICE_URL=https://${HOST}"
