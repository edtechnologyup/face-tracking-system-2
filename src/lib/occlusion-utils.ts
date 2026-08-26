/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Estimates occlusion score based on MediaPipe face landmarks.
 * @param landmarks MediaPipe landmarks array (468 points)
 * @returns Occlusion score from 0.0 (no occlusion) to 1.0 (fully occluded)
 */
export function calculateOcclusionScore(landmarks: any[]): number {
  if (!landmarks || landmarks.length < 468) {
    return 1.0; // No face found = fully occluded/missing
  }

  try {
    // We use a heuristic: The geometric relationships of key facial features.
    // If a face is occluded (e.g., by a hand or mask), MediaPipe struggles to predict 
    // the mouth and nose correctly, often squishing them or placing them at weird distances.
    
    // Key points (MediaPipe indices)
    const noseTip = landmarks[1];
    const chin = landmarks[152];
    const leftEye = landmarks[159];
    const rightEye = landmarks[386];
    const mouthTop = landmarks[13];
    const mouthBottom = landmarks[14];
    
    if (!noseTip || !chin || !leftEye || !rightEye || !mouthTop || !mouthBottom) {
      return 0.5;
    }

    // Calculate inter-ocular distance (IOD) as a normalization scale
    const iodX = leftEye.x - rightEye.x;
    const iodY = leftEye.y - rightEye.y;
    const iod = Math.sqrt(iodX*iodX + iodY*iodY);
    
    if (iod === 0) return 1.0;

    // Check 1: Distance from nose to chin (normalized)
    // Normally, nose to chin is roughly 1.5x to 2x IOD. 
    // If it's extremely small, the lower face might be squished by a mask.
    const noseChinDist = Math.sqrt(Math.pow(noseTip.x - chin.x, 2) + Math.pow(noseTip.y - chin.y, 2));
    const normNoseChin = noseChinDist / iod;
    
    let score = 0.0;
    
    // If nose is abnormally close to chin (distorted face mesh)
    if (normNoseChin < 0.8) {
      score += 0.4;
    } else if (normNoseChin < 1.2) {
      score += 0.2;
    }
    
    // Check 2: Mouth opening height (normalized)
    // If someone is wearing a mask, the mouth landmarks often collapse into a very tight, flat line.
    const mouthHeight = Math.sqrt(Math.pow(mouthTop.x - mouthBottom.x, 2) + Math.pow(mouthTop.y - mouthBottom.y, 2));
    const normMouthHeight = mouthHeight / iod;
    
    // If mouth height is nearly zero continuously, it might be occluded by a mask
    if (normMouthHeight < 0.01) {
      score += 0.3;
    }
    
    // Check 3: Check Z-depth anomaly (mask often flattens the Z-depth of mouth/nose)
    // Normally nose tip is closer to camera (lower Z) than cheeks/eyes.
    const noseZ = noseTip.z || 0;
    const eyeZ = (leftEye.z + rightEye.z) / 2 || 0;
    
    // If nose is behind or flat with eyes, severe distortion
    if (noseZ > eyeZ) {
       score += 0.3;
    }

    return Math.min(1.0, score);
  } catch (err) {
    return 0.0;
  }
}
