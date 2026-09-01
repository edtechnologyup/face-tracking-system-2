import * as faceApiImport from 'face-api.js';
import { loadFaceApiModels, isModelsLoaded } from '@/lib/face-api/detection';

const faceApiImportUnknown: unknown = faceApiImport;
export const faceapi: typeof faceApiImport =
  faceApiImportUnknown && typeof faceApiImportUnknown === 'object' && 'default' in faceApiImportUnknown
    ? (faceApiImportUnknown as { default: typeof faceApiImport }).default
    : faceApiImport;

export async function ensureFaceApiReady(): Promise<boolean> {
  await loadFaceApiModels();
  return isModelsLoaded();
}

export const TINY_FACE_OPTIONS = () =>
  new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
