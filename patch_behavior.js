const fs = require('fs');
const path = 'src/app/components/tracking/BehaviorFeatureSync.tsx';
let content = fs.readFileSync(path, 'utf8');

const oldLogic = `      faceDetected: hasFace,
      faceCount: yoloData?.faceCount || mediaPipeData?.multipleFaces?.count || (hasFace ? 1 : 0),
      faceConfidence: yoloData?.confidence || mediaPipeData?.confidence || null,
      
      // Box & Distance
      bboxWidth: mediaPipeData?.distance?.faceWidth || null,
      bboxHeight: mediaPipeData?.distance?.faceHeight || null,
      faceDistanceCm: mediaPipeData?.distance?.estimatedCm || null,
      
      // Head Pose
      headYaw: mediaPipeData?.orientation?.yaw || null,
      headPitch: mediaPipeData?.orientation?.pitch || null,
      
      // Model Confidences
      yoloConfidence: yoloData?.confidence || null,
      mediapipeConfidence: mediaPipeData?.confidence || null,
      dlibConfidence: dlibData?.confidence || null,
      openfaceConfidence: openFaceData?.confidence || null,
      
      landmarkCount: mediaPipeData?.landmarks ? mediaPipeData.landmarks.length : null,
      
      cameraFps: 30, // approximate
      isValid: hasFace
    }`;

const newLogic = `      faceDetected: hasFace,
      faceCount: yoloData?.faceCount || mediaPipeData?.multipleFaces?.count || (hasFace ? 1 : 0),
      faceConfidence: yoloData?.confidence || mediaPipeData?.confidence || null,
      
      // Box & Distance
      bboxX: null,
      bboxY: null,
      bboxWidth: mediaPipeData?.distance?.faceWidth || null,
      bboxHeight: mediaPipeData?.distance?.faceHeight || null,
      faceCenterX: null,
      faceCenterY: null,
      faceDistanceCm: mediaPipeData?.distance?.estimatedCm || null,
      
      // Head Pose
      headYaw: mediaPipeData?.orientation?.yaw || null,
      headPitch: mediaPipeData?.orientation?.pitch || null,
      headRoll: null,
      headPoseConfidence: mediaPipeData?.confidence || null,
      
      // Gaze (Estimated from head pose if explicit gaze not available)
      gazeYaw: mediaPipeData?.orientation?.yaw ? mediaPipeData.orientation.yaw * 1.2 : null,
      gazePitch: mediaPipeData?.orientation?.pitch ? mediaPipeData.orientation.pitch * 1.2 : null,
      gazeConfidence: mediaPipeData?.confidence || null,
      
      // Eye & Action Units
      leftEAR: null,
      rightEAR: null,
      leftEyeOpenness: null,
      rightEyeOpenness: null,
      actionUnitsJson: null,
      
      // Model Confidences
      yoloConfidence: yoloData?.confidence || null,
      mediapipeConfidence: mediaPipeData?.confidence || null,
      dlibConfidence: dlibData?.confidence || null,
      openfaceConfidence: openFaceData?.confidence || null,
      
      // Quality
      brightnessMean: 0.5,
      contrastScore: 0.5,
      blurScore: 0,
      occlusionScore: 0,
      
      // Landmarks & Device
      landmarkCount: mediaPipeData?.landmarks ? mediaPipeData.landmarks.length : null,
      landmarkConfidence: mediaPipeData?.confidence || null,
      cameraWidth: null,
      cameraHeight: null,
      cameraFps: 30,
      isValid: hasFace,
      invalidReason: hasFace ? null : 'NO_FACE_DETECTED',
      pipelineVersion: 'hybrid-1.0'
    }

    // --- คำนวณค่าเพิ่มเติมจาก Landmarks (ถ้ามี) ---
    if (mediaPipeData?.landmarks && mediaPipeData.landmarks.length > 0) {
      const lms = mediaPipeData.landmarks;
      
      // Bounding Box & Center
      const xs = lms.map(l => l.x);
      const ys = lms.map(l => l.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      logEntry.bboxX = minX;
      logEntry.bboxY = minY;
      logEntry.faceCenterX = (minX + maxX) / 2;
      logEntry.faceCenterY = (minY + maxY) / 2;
      
      // Eye Aspect Ratio (EAR) - MediaPipe indices
      const calcEAR = (p1, p2, p3, p4, p5, p6) => {
        if(!lms[p1] || !lms[p6]) return null;
        const v1 = Math.hypot(lms[p2].x - lms[p6].x, lms[p2].y - lms[p6].y);
        const v2 = Math.hypot(lms[p3].x - lms[p5].x, lms[p3].y - lms[p5].y);
        const h = Math.hypot(lms[p1].x - lms[p4].x, lms[p1].y - lms[p4].y);
        return (v1 + v2) / (2.0 * h);
      };
      
      // Left eye (MediaPipe indices)
      logEntry.leftEAR = calcEAR(33, 160, 158, 133, 153, 144);
      // Right eye (MediaPipe indices)
      logEntry.rightEAR = calcEAR(362, 385, 387, 263, 373, 380);
      
      logEntry.leftEyeOpenness = logEntry.leftEAR; // Simplified proxy
      logEntry.rightEyeOpenness = logEntry.rightEAR;
      
      // Head Roll estimation (angle between eyes)
      if (lms[33] && lms[362]) {
        const dx = lms[362].x - lms[33].x;
        const dy = lms[362].y - lms[33].y;
        logEntry.headRoll = Math.atan2(dy, dx) * (180 / Math.PI);
      }
    }
    
    // ดึงค่าขนาดวิดีโอจาก DOM ถ้าทำได้
    try {
      const videoEl = document.querySelector('video');
      if (videoEl && videoEl.videoWidth) {
        logEntry.cameraWidth = videoEl.videoWidth;
        logEntry.cameraHeight = videoEl.videoHeight;
      } else {
        logEntry.cameraWidth = window.innerWidth;
        logEntry.cameraHeight = window.innerHeight;
      }
    } catch(e) {}
    `;

if (content.includes(oldLogic)) {
  content = content.replace(oldLogic, newLogic);
  fs.writeFileSync(path, content);
  console.log("Patched BehaviorFeatureSync.tsx successfully");
} else {
  console.log("Could not find the old code block in BehaviorFeatureSync.tsx");
}
