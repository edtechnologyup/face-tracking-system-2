import type { InferenceSession, Tensor } from 'onnxruntime-common';
import {
  L2CS_BIN_DEGREES,
  L2CS_IMAGENET_MEAN,
  L2CS_IMAGENET_STD,
  L2CS_INPUT_SIZE,
  L2CS_MODEL_FILE,
  L2CS_NUM_BINS,
  type PixelFaceBox,
  padFaceBox,
} from './l2cs-constants';

const MODEL_URL = `/models/${L2CS_MODEL_FILE}`;

type OrtRuntime = typeof import('onnxruntime-web');

let ortPromise: Promise<OrtRuntime> | null = null;
let sessionPromise: Promise<InferenceSession> | null = null;

async function getOrt(): Promise<OrtRuntime> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web') as Promise<OrtRuntime>;
  }
  return ortPromise;
}

function configureOrtWasm(ort: OrtRuntime): void {
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
}

export async function loadL2csOnnxSession(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await getOrt();
      configureOrtWasm(ort);
      return ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
      });
    })();
  }
  return sessionPromise;
}

function softmaxMaxConfidence(logits: Float32Array, bins = L2CS_NUM_BINS): number {
  const slice = logits.length >= bins ? logits.subarray(0, bins) : logits;
  let maxLogit = slice[0];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] > maxLogit) maxLogit = slice[i];
  }
  let sumExp = 0;
  let maxProb = 0;
  for (let i = 0; i < slice.length; i++) {
    const p = Math.exp(slice[i] - maxLogit);
    sumExp += p;
    if (p > maxProb) maxProb = p;
  }
  return Number((maxProb / sumExp).toFixed(3));
}

/** L2CS 90-bin softmax expectation → degrees (see edavalosanaya/L2CS-Net pipeline). */
export function binLogitsToDegrees(logits: Float32Array, bins = L2CS_NUM_BINS): number {
  const slice = logits.length >= bins ? logits.subarray(0, bins) : logits;
  let maxLogit = slice[0];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] > maxLogit) maxLogit = slice[i];
  }
  let sumExp = 0;
  const probs = new Float32Array(slice.length);
  for (let i = 0; i < slice.length; i++) {
    probs[i] = Math.exp(slice[i] - maxLogit);
    sumExp += probs[i];
  }
  let expectedIdx = 0;
  for (let i = 0; i < slice.length; i++) {
    expectedIdx += (probs[i] / sumExp) * i;
  }
  return Number((expectedIdx * L2CS_BIN_DEGREES - 180).toFixed(1));
}

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

function getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!sharedCtx) throw new Error('Canvas 2D context unavailable');
  return { canvas: sharedCanvas, ctx: sharedCtx };
}

function preprocessFaceCrop(
  video: HTMLVideoElement,
  faceBox: PixelFaceBox,
  TensorCtor: typeof Tensor
): Tensor {
  const { canvas, ctx } = getCanvas();
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const box = padFaceBox(faceBox, vw, vh);

  canvas.width = L2CS_INPUT_SIZE;
  canvas.height = L2CS_INPUT_SIZE;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, L2CS_INPUT_SIZE, L2CS_INPUT_SIZE);
  ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, L2CS_INPUT_SIZE, L2CS_INPUT_SIZE);

  const imageData = ctx.getImageData(0, 0, L2CS_INPUT_SIZE, L2CS_INPUT_SIZE);
  const { data } = imageData;
  const float32 = new Float32Array(3 * L2CS_INPUT_SIZE * L2CS_INPUT_SIZE);
  const planeSize = L2CS_INPUT_SIZE * L2CS_INPUT_SIZE;

  for (let i = 0; i < planeSize; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    float32[i] = (r - L2CS_IMAGENET_MEAN[0]) / L2CS_IMAGENET_STD[0];
    float32[i + planeSize] = (g - L2CS_IMAGENET_MEAN[1]) / L2CS_IMAGENET_STD[1];
    float32[i + 2 * planeSize] = (b - L2CS_IMAGENET_MEAN[2]) / L2CS_IMAGENET_STD[2];
  }

  return new TensorCtor('float32', float32, [1, 3, L2CS_INPUT_SIZE, L2CS_INPUT_SIZE]);
}

export interface L2csOnnxInferenceResult {
  gazePitch: number;
  gazeYaw: number;
  confidence: number;
  pitchBinConfidence: number;
  yawBinConfidence: number;
  latencyMs: number;
}

export async function runL2csOnnxInference(
  video: HTMLVideoElement,
  faceBox: PixelFaceBox
): Promise<L2csOnnxInferenceResult> {
  const start = performance.now();
  const ort = await getOrt();
  const session = await loadL2csOnnxSession();
  const tensor = preprocessFaceCrop(video, faceBox, ort.Tensor);

  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: tensor });

  const outputNames = session.outputNames;
  const pitchTensor = results[outputNames[0]];
  const yawTensor = results[outputNames[1] ?? outputNames[0]];

  const pitchLogits = pitchTensor.data as Float32Array;
  const yawLogits = yawTensor.data as Float32Array;

  const gazePitch = binLogitsToDegrees(pitchLogits);
  const gazeYaw = binLogitsToDegrees(yawLogits);
  const pitchBinConfidence = softmaxMaxConfidence(pitchLogits);
  const yawBinConfidence = softmaxMaxConfidence(yawLogits);
  const confidence = Number(((pitchBinConfidence + yawBinConfidence) / 2).toFixed(3));

  return {
    gazePitch,
    gazeYaw,
    confidence,
    pitchBinConfidence,
    yawBinConfidence,
    latencyMs: Number((performance.now() - start).toFixed(1)),
  };
}
