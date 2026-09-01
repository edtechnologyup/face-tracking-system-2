/** L2 auxiliary: 68-point geometry fit quality (not TinyFaceDetector score). */
export function computeDlibLandmarkConfidence(
  landmarks68: Array<{ x: number; y: number }>
): number | null {
  if (landmarks68.length < 68) return null;

  const leftEye = landmarks68[36];
  const rightEye = landmarks68[45];
  const nose = landmarks68[30];
  const chin = landmarks68[8];
  const leftMouth = landmarks68[48];
  const rightMouth = landmarks68[54];

  if (!leftEye || !rightEye || !nose || !chin || !leftMouth || !rightMouth) return null;

  const interEye = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (interEye < 8) return null;

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const noseOffset = Math.abs(nose.x - eyeMidX) / interEye;
  const mouthWidth = Math.hypot(rightMouth.x - leftMouth.x, rightMouth.y - leftMouth.y);
  const mouthRatio = mouthWidth / interEye;
  const faceHeight = Math.hypot(chin.x - eyeMidX, chin.y - eyeMidY);
  const heightRatio = faceHeight / interEye;

  const noseOk = noseOffset < 0.35 ? 1 : 0.5;
  const mouthOk = mouthRatio > 0.35 && mouthRatio < 1.2 ? 1 : 0.55;
  const heightOk = heightRatio > 0.9 && heightRatio < 2.5 ? 1 : 0.55;

  const score = Math.min(1, Math.max(0, noseOk * 0.35 + mouthOk * 0.35 + heightOk * 0.3));
  return Number(score.toFixed(3));
}
