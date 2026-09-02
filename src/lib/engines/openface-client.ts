import type { OpenFaceActionUnits, OpenFaceDetectionResult } from '@/lib/engines/openface-detector';
import { enqueueOpenFaceRequest } from '@/lib/engines/openface-queue';

export interface OpenFaceRemoteAnalyzeResponse {
  isDetected: boolean;
  confidence: number | null;
  actionUnits: OpenFaceActionUnits | Record<string, number> | null;
  gazeYaw: number | null;
  gazePitch: number | null;
  latencyMs: number;
  source: string;
  device?: string;
  clientRoundTripMs?: number;
}

export async function analyzeOpenFaceRemote(
  imageBase64: string
): Promise<OpenFaceRemoteAnalyzeResponse | null> {
  return enqueueOpenFaceRequest(async () => {
    try {
      const t0 = performance.now();
      const res = await fetch('/api/tracking/openface-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      const clientRoundTripMs = Number((performance.now() - t0).toFixed(1));

      if (res.status === 503) return null;
      if (!res.ok) {
        console.warn('OpenFace remote analyze failed:', res.status, await res.text());
        return null;
      }

      const payload = (await res.json()) as OpenFaceRemoteAnalyzeResponse;
      return { ...payload, clientRoundTripMs };
    } catch (err) {
      console.warn('OpenFace remote analyze error:', err);
      return null;
    }
  });
}

export function mapRemoteToOpenFaceResult(
  remote: OpenFaceRemoteAnalyzeResponse,
  timestamp: number
): OpenFaceDetectionResult {
  const gazeYaw = remote.gazeYaw ?? 0;
  const gazePitch = remote.gazePitch ?? 0;
  const pitchRad = (gazePitch * Math.PI) / 180;
  const yawRad = (gazeYaw * Math.PI) / 180;
  const roundTripMs = remote.clientRoundTripMs ?? remote.latencyMs;

  return {
    isDetected: remote.isDetected,
    actionUnits: remote.actionUnits as OpenFaceActionUnits | null,
    gazeVector: {
      x: Number((Math.sin(yawRad) * Math.cos(pitchRad)).toFixed(3)),
      y: Number(Math.sin(pitchRad).toFixed(3)),
      z: Number((-Math.cos(yawRad) * Math.cos(pitchRad)).toFixed(3)),
      eyeContact: Math.abs(gazeYaw) < 15 && Math.abs(gazePitch) < 12,
    },
    poseAngle: {
      pitch: gazePitch,
      yaw: gazeYaw,
      roll: 0,
    },
    confidence: remote.confidence,
    latencyMs: roundTripMs,
    fps: roundTripMs > 0 ? Number((1000 / roundTripMs).toFixed(1)) : 0,
    source: 'openface-server',
    timestamp,
    serverLatencyMs: remote.latencyMs,
    clientRoundTripMs: remote.clientRoundTripMs ?? roundTripMs,
  };
}
