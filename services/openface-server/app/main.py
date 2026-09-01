"""OpenFace 3.0 HTTP service for Phase 4 remote AU + confidence."""
from __future__ import annotations

import asyncio
import base64
import binascii
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app.inference import analyze_jpeg_bytes, device_name, load_models
from app.queue import MAX_CONCURRENT

app = FastAPI(title="OpenFace Server", version="3.0.0")

_inference_semaphore = asyncio.Semaphore(MAX_CONCURRENT)


class AnalyzeRequest(BaseModel):
    imageBase64: str = Field(..., description="JPEG base64 without data-uri prefix")


class HealthResponse(BaseModel):
    status: str
    openfaceDevice: str | None = None


def verify_api_key(x_openface_key: str | None = Header(default=None)) -> None:
    expected = os.environ.get("OPENFACE_API_KEY")
    if not expected:
        return
    if x_openface_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-OpenFace-Key")


@app.get("/health")
def health() -> HealthResponse:
    """Fast liveness probe for Railway — does not load PyTorch weights."""
    return HealthResponse(status="ok", openfaceDevice=device_name())


@app.get("/health/ready")
def health_ready() -> HealthResponse:
    """Readiness probe — loads models (slow on first boot)."""
    try:
        _, _, dev = load_models()
        return HealthResponse(status="ok", openfaceDevice=dev)
    except Exception as err:
        return HealthResponse(status=f"degraded: {err}")


@app.post("/v1/analyze")
def analyze(body: AnalyzeRequest, _: None = Depends(verify_api_key)):
    raw = body.imageBase64.strip()
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[-1]

    try:
        image_bytes = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as err:
        raise HTTPException(status_code=400, detail="Invalid base64 image") from err

    if len(image_bytes) > 6_000_000:
        raise HTTPException(status_code=413, detail="Image too large (max ~6MB)")

    try:
        async with _inference_semaphore:
            result = await asyncio.to_thread(analyze_jpeg_bytes, image_bytes)
        return result
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"OpenFace inference failed: {err}") from err
