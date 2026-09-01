import type { InferenceSession, Tensor } from 'onnxruntime-common';

const MODEL_URL = '/models/yolov8n-face.onnx';
const INPUT_SIZE = 640;
/** Single-class face detector (lindevs yolov8-face) */
const TARGET_CLASS_ID = 0;
const SCORE_THRESHOLD = 0.35;
const IOU_THRESHOLD = 0.45;

export interface YoloOnnxBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  classId: number;
}

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

export async function loadYoloOnnxSession(): Promise<InferenceSession> {
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

function preprocessFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  TensorCtor: typeof Tensor
): { tensor: Tensor; scale: number; padX: number; padY: number; srcW: number; srcH: number } {
  const srcW = video.videoWidth || 640;
  const srcH = video.videoHeight || 480;
  const scale = Math.min(INPUT_SIZE / srcW, INPUT_SIZE / srcH);
  const drawW = Math.round(srcW * scale);
  const drawH = Math.round(srcH * scale);
  const padX = Math.floor((INPUT_SIZE - drawW) / 2);
  const padY = Math.floor((INPUT_SIZE - drawH) / 2);

  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(video, padX, padY, drawW, drawH);

  const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = imageData;
  const float32 = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

  for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    float32[i] = r;
    float32[i + INPUT_SIZE * INPUT_SIZE] = g;
    float32[i + 2 * INPUT_SIZE * INPUT_SIZE] = b;
  }

  return {
    tensor: new TensorCtor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    scale,
    padX,
    padY,
    srcW,
    srcH,
  };
}

function iou(a: YoloOnnxBox, b: YoloOnnxBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

function nms(boxes: YoloOnnxBox[]): YoloOnnxBox[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: YoloOnnxBox[] = [];

  for (const box of sorted) {
    if (kept.every(k => iou(k, box) < IOU_THRESHOLD)) {
      kept.push(box);
    }
  }
  return kept;
}

function decodeOutput(
  output: Tensor,
  scale: number,
  padX: number,
  padY: number,
  srcW: number,
  srcH: number
): YoloOnnxBox[] {
  const data = output.data as Float32Array;
  const dims = output.dims;
  const channels = dims[1] ?? 84;
  const anchors = dims[2] ?? dims[1] ?? 0;
  const transposed = channels < anchors;
  const numClasses = channels - 4;
  const numAnchors = transposed ? anchors : channels;
  const boxes: YoloOnnxBox[] = [];

  for (let i = 0; i < numAnchors; i++) {
    let cx: number;
    let cy: number;
    let w: number;
    let h: number;
    let bestScore = 0;
    let bestClass = -1;

    if (transposed) {
      cx = data[0 * numAnchors + i];
      cy = data[1 * numAnchors + i];
      w = data[2 * numAnchors + i];
      h = data[3 * numAnchors + i];
      for (let c = 0; c < numClasses; c++) {
        const score = data[(4 + c) * numAnchors + i];
        if (score > bestScore) {
          bestScore = score;
          bestClass = c;
        }
      }
    } else {
      const offset = i * channels;
      cx = data[offset];
      cy = data[offset + 1];
      w = data[offset + 2];
      h = data[offset + 3];
      for (let c = 0; c < numClasses; c++) {
        const score = data[offset + 4 + c];
        if (score > bestScore) {
          bestScore = score;
          bestClass = c;
        }
      }
    }

    if (bestClass !== TARGET_CLASS_ID || bestScore < SCORE_THRESHOLD) continue;

    const x1 = (cx - w / 2 - padX) / scale;
    const y1 = (cy - h / 2 - padY) / scale;
    const bw = w / scale;
    const bh = h / scale;

    boxes.push({
      x: Math.max(0, Math.round(x1)),
      y: Math.max(0, Math.round(y1)),
      width: Math.min(srcW, Math.round(bw)),
      height: Math.min(srcH, Math.round(bh)),
      confidence: Number(bestScore.toFixed(3)),
      classId: bestClass,
    });
  }

  return nms(boxes);
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

export async function runYoloOnnxDetection(video: HTMLVideoElement): Promise<{
  boxes: YoloOnnxBox[];
  latencyMs: number;
}> {
  const start = performance.now();
  const ort = await getOrt();
  const session = await loadYoloOnnxSession();
  const { canvas, ctx } = getCanvas();
  const { tensor, scale, padX, padY, srcW, srcH } = preprocessFrame(video, canvas, ctx, ort.Tensor);

  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0];
  const output = results[outputName];

  const boxes = decodeOutput(output, scale, padX, padY, srcW, srcH);
  return {
    boxes,
    latencyMs: Number((performance.now() - start).toFixed(1)),
  };
}
