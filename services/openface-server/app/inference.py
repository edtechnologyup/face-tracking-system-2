"""OpenFace 3.0 inference wrapper — lazy model load, CPU/GPU via OPENFACE_DEVICE."""
from __future__ import annotations

import os
import tempfile
import time
from typing import Any

import cv2
import numpy as np
import torch

# Standard AU indices returned by OpenFace multitask head (subset mapped for logging)
AU_INDEX_MAP: dict[int, str] = {
    0: "AU01_InnerBrowRaiser",
    1: "AU02_OuterBrowRaiser",
    2: "AU04_BrowLowerer",
    3: "AU06_CheekRaiser",
    4: "AU09_NoseWrinkler",
    5: "AU10_UpperLipRaiser",
    6: "AU12_LipCornerPuller",
    7: "AU14_Dimpler",
    8: "AU15_LipCornerDepressor",
    9: "AU17_ChinRaiser",
    10: "AU20_LipStretcher",
    11: "AU23_LipTightener",
    12: "AU25_LipsPart",
    13: "AU26_JawDrop",
    14: "AU45_Blink",
}

_models: tuple[Any, Any, str] | None = None
_models_error: str | None = None


def weights_dir() -> str:
    return os.environ.get("OPENFACE_WEIGHTS_DIR", "/app/weights")


def device_name() -> str:
    requested = os.environ.get("OPENFACE_DEVICE", "cpu")
    if requested == "cuda" and torch.cuda.is_available():
        return "cuda"
    return "cpu"


def ensure_weights() -> None:
    wdir = weights_dir()
    os.makedirs(wdir, exist_ok=True)
    required = ["Alignment_RetinaFace.pth", "MTL_backbone.pth"]
    missing = [f for f in required if not os.path.isfile(os.path.join(wdir, f))]
    if not missing:
        return
    try:
        import subprocess

        subprocess.run(["openface", "download"], check=True, cwd=wdir, env={**os.environ, "HOME": wdir})
    except Exception as err:
        raise RuntimeError(
            f"OpenFace weights missing ({', '.join(missing)}). Run `openface download` or mount {wdir}."
        ) from err


def load_models() -> tuple[Any, Any, str]:
    global _models, _models_error
    if _models is not None:
        return _models
    if _models_error is not None:
        raise RuntimeError(_models_error)

    try:
        ensure_weights()
        from openface.face_detection import FaceDetector
        from openface.multitask_model import MultitaskPredictor

        wdir = weights_dir()
        dev = device_name()
        face_detector = FaceDetector(
            model_path=os.path.join(wdir, "Alignment_RetinaFace.pth"),
            device=dev,
        )
        multitask = MultitaskPredictor(
            model_path=os.path.join(wdir, "MTL_backbone.pth"),
            device=dev,
        )
        _models = (face_detector, multitask, dev)
        return _models
    except Exception as err:
        _models_error = str(err)
        raise


def _tensor_to_floats(t: torch.Tensor) -> list[float]:
    return [float(x) for x in t.detach().cpu().flatten().tolist()]


def _map_action_units(au_tensor: torch.Tensor) -> dict[str, float]:
    values = _tensor_to_floats(au_tensor)
    mapped: dict[str, float] = {}
    for idx, val in enumerate(values):
        key = AU_INDEX_MAP.get(idx)
        if key:
            mapped[key] = round(max(0.0, min(1.0, val)), 4)
    return mapped


def analyze_jpeg_bytes(image_bytes: bytes) -> dict[str, Any]:
    start = time.perf_counter()
    face_detector, multitask, dev = load_models()

    nparr = np.frombuffer(image_bytes, np.uint8)
    image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise ValueError("Invalid JPEG payload")

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=True) as tmp:
        tmp.write(image_bytes)
        tmp.flush()
        cropped_face, dets = face_detector.get_face(tmp.name)

    if cropped_face is None or dets is None or len(dets) == 0:
        return {
            "isDetected": False,
            "confidence": None,
            "actionUnits": None,
            "gazeYaw": None,
            "gazePitch": None,
            "latencyMs": round((time.perf_counter() - start) * 1000, 1),
            "source": "openface-3.0",
            "device": dev,
        }

    det = dets[0]
    face_confidence = float(det[4]) if len(det) > 4 else 0.0

    emotion_logits, gaze_output, au_output = multitask.predict(cropped_face)
    gaze_vals = _tensor_to_floats(gaze_output)
    gaze_yaw = round(gaze_vals[0], 2) if len(gaze_vals) > 0 else None
    gaze_pitch = round(gaze_vals[1], 2) if len(gaze_vals) > 1 else None

    return {
        "isDetected": True,
        "confidence": round(face_confidence, 4),
        "actionUnits": _map_action_units(au_output),
        "gazeYaw": gaze_yaw,
        "gazePitch": gaze_pitch,
        "latencyMs": round((time.perf_counter() - start) * 1000, 1),
        "source": "openface-3.0",
        "device": dev,
    }
