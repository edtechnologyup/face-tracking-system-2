#!/usr/bin/env python3
"""Download OpenFace 3.0 weights from Hugging Face (avoids broken openface CLI deps)."""
from __future__ import annotations

import os
import sys

from huggingface_hub import hf_hub_download

REPO_ID = "nutPace/openface_weights"
REQUIRED = (
    "Alignment_RetinaFace.pth",
    "MTL_backbone.pth",
    "mobilenetV1X0.25_pretrain.tar",
)


def main() -> int:
    weights_dir = os.environ.get("OPENFACE_WEIGHTS_DIR", "/app/weights")
    os.makedirs(weights_dir, exist_ok=True)

    for filename in REQUIRED:
        dest = os.path.join(weights_dir, filename)
        if os.path.isfile(dest) and os.path.getsize(dest) > 0:
            print(f"✓ {filename} already present")
            continue

        print(f"↓ Downloading {filename} from {REPO_ID}...")
        downloaded = hf_hub_download(
            repo_id=REPO_ID,
            filename=filename,
            local_dir=weights_dir,
        )
        print(f"✓ Saved {downloaded}")

    missing = [f for f in REQUIRED if not os.path.isfile(os.path.join(weights_dir, f))]
    if missing:
        print(f"ERROR: missing weights: {', '.join(missing)}", file=sys.stderr)
        return 1

    print("OpenFace weights ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
