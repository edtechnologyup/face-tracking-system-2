const fs = require('fs');
const file = '/home/paipu/Project/face-tracking-system/src/app/components/tracking/BehaviorFeatureSync.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add imports
content = content.replace(
  "import { useEffect, useRef } from 'react'",
  "import { useEffect, useRef, useState } from 'react'\nimport { analyzeImageQuality } from '@/lib/image-quality'\nimport { calculateOcclusionScore } from '@/lib/occlusion-utils'"
);

// 2. Add Refs for FPS and Quality Tracking
const refsToAdd = `
  const lastQualityCheckRef = useRef<number>(0);
  const latestQualityRef = useRef({ brightnessMean: 0.5, contrastScore: 0.5, blurScore: 0 });
  const frameCountRef = useRef<number>(0);
  const fpsWindowStartRef = useRef<number>(Date.now());
  const currentFpsRef = useRef<number>(30);
  
  // Throttle timer variables
`;
content = content.replace(
  "const lastSampleTimeRef = useRef<number>(Date.now())",
  "const lastSampleTimeRef = useRef<number>(Date.now())\n" + refsToAdd
);

// 3. Insert logic inside the useEffect
const logicToAdd = `
    // FPS Calculation (runs every cycle)
    frameCountRef.current++;
    if (now - fpsWindowStartRef.current >= 1000) {
      currentFpsRef.current = frameCountRef.current;
      frameCountRef.current = 0;
      fpsWindowStartRef.current = now;
    }

    // Quality check (throttled to every 2 seconds for performance)
    if (now - lastQualityCheckRef.current >= 2000) {
      lastQualityCheckRef.current = now;
      const videoEl = document.querySelector('video');
      let bbox = null;
      if (mediaPipeData?.landmarks && videoEl) {
        // approximate bounding box from landmarks
        const xs = mediaPipeData.landmarks.map((l: any) => l.x * videoEl.videoWidth);
        const ys = mediaPipeData.landmarks.map((l: any) => l.y * videoEl.videoHeight);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
      if (videoEl) {
         // Using setTimeout to defer processing and not block the main React render cycle
         setTimeout(() => {
           latestQualityRef.current = analyzeImageQuality(videoEl, bbox);
         }, 0);
      }
    }
    
    // Calculate Occlusion Score
    const currentOcclusionScore = mediaPipeData?.landmarks ? calculateOcclusionScore(mediaPipeData.landmarks) : (hasFace ? 0 : 1.0);
`;

content = content.replace(
  "const hasFace = !!(mediaPipeData?.isDetected || yoloData?.isDetected)",
  "const hasFace = !!(mediaPipeData?.isDetected || yoloData?.isDetected)\n" + logicToAdd
);

// 4. Update the logEntry
content = content.replace(
  "brightnessMean: 0.5,",
  "brightnessMean: latestQualityRef.current.brightnessMean,"
);
content = content.replace(
  "contrastScore: 0.5,",
  "contrastScore: latestQualityRef.current.contrastScore,"
);
content = content.replace(
  "blurScore: 0,",
  "blurScore: latestQualityRef.current.blurScore,"
);
content = content.replace(
  "occlusionScore: 0,",
  "occlusionScore: currentOcclusionScore,"
);
content = content.replace(
  "cameraFps: 30,",
  "cameraFps: currentFpsRef.current,"
);

fs.writeFileSync(file, content);
console.log('Updated BehaviorFeatureSync.tsx');
