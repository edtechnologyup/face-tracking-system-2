export interface ImageQualityScores {
  brightnessMean: number;
  contrastScore: number;
  /** Laplacian variance normalized 0–1; สูง = ภาพคมชัด */
  sharpnessScore: number;
}

// Reusable canvas so we don't create DOM elements every 2 seconds
let _qualityCanvas: HTMLCanvasElement | null = null;
let _qualityCtx: CanvasRenderingContext2D | null = null;

/**
 * Calculates brightness, contrast, and sharpness of a cropped region of a video.
 * @param video The source video element
 * @param bbox Bounding box to crop {x, y, width, height}
 */
export function analyzeImageQuality(
  video: HTMLVideoElement,
  bbox: { x: number, y: number, width: number, height: number } | null
): ImageQualityScores {
  // Fallbacks if no video or invalid size
  if (!video || video.videoWidth === 0) {
    return { brightnessMean: 0.5, contrastScore: 0.5, sharpnessScore: 0 };
  }

  // Target small resolution for fast performance
  const TARGET_SIZE = 64; 

  if (!_qualityCanvas) {
    _qualityCanvas = document.createElement('canvas');
    _qualityCanvas.width = TARGET_SIZE;
    _qualityCanvas.height = TARGET_SIZE;
    _qualityCtx = _qualityCanvas.getContext('2d', { willReadFrequently: true });
  }
  
  if (!_qualityCtx || !_qualityCanvas) {
    return { brightnessMean: 0.5, contrastScore: 0.5, sharpnessScore: 0 };
  }

  let sourceX = 0, sourceY = 0, sourceW = video.videoWidth, sourceH = video.videoHeight;
  
  // Crop to face bounding box if available and valid
  if (bbox && bbox.width > 0 && bbox.height > 0) {
    // Add 10% padding around face
    const paddingX = bbox.width * 0.1;
    const paddingY = bbox.height * 0.1;
    sourceX = Math.max(0, bbox.x - paddingX);
    sourceY = Math.max(0, bbox.y - paddingY);
    sourceW = Math.min(video.videoWidth - sourceX, bbox.width + paddingX * 2);
    sourceH = Math.min(video.videoHeight - sourceY, bbox.height + paddingY * 2);
  }

  try {
    _qualityCtx.clearRect(0, 0, TARGET_SIZE, TARGET_SIZE);
    _qualityCtx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, TARGET_SIZE, TARGET_SIZE);
    
    const imageData = _qualityCtx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE);
    const data = imageData.data;
    const len = data.length;

    // 1. Calculate Brightness (Luminance) and build grayscale array
    let totalLuminance = 0;
    const grayscale = new Float32Array(TARGET_SIZE * TARGET_SIZE);
    let gIndex = 0;

    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Standard perceived luminance
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += luma;
      grayscale[gIndex++] = luma;
    }

    const pixelCount = TARGET_SIZE * TARGET_SIZE;
    const meanLuminance = totalLuminance / pixelCount;
    // Normalize brightness 0.0 - 1.0
    const brightnessMean = Math.min(1.0, meanLuminance / 255.0);

    // 2. Calculate Contrast (RMS Contrast - standard deviation of pixel intensities)
    let sumSquaredDiff = 0;
    for (let i = 0; i < pixelCount; i++) {
      const diff = grayscale[i] - meanLuminance;
      sumSquaredDiff += diff * diff;
    }
    const variance = sumSquaredDiff / pixelCount;
    const rmsContrast = Math.sqrt(variance);
    // Normalize contrast (max theoretical RMS contrast is around 127)
    const contrastScore = Math.min(1.0, rmsContrast / 127.0);

    // 3. Variance of Laplacian — higher = sharper image
    let laplacianSum = 0;
    let laplacianSqSum = 0;
    let laplacianCount = 0;

    for (let y = 1; y < TARGET_SIZE - 1; y++) {
      for (let x = 1; x < TARGET_SIZE - 1; x++) {
        const i = y * TARGET_SIZE + x;
        const top = grayscale[i - TARGET_SIZE];
        const bottom = grayscale[i + TARGET_SIZE];
        const left = grayscale[i - 1];
        const right = grayscale[i + 1];
        const center = grayscale[i];

        const lap = top + bottom + left + right - 4 * center;
        laplacianSum += lap;
        laplacianSqSum += lap * lap;
        laplacianCount++;
      }
    }

    const lapMean = laplacianSum / laplacianCount;
    const lapVariance = (laplacianSqSum / laplacianCount) - (lapMean * lapMean);
    
    const sharpnessScore = Math.min(1.0, lapVariance / 1000.0);

    return {
      brightnessMean,
      contrastScore,
      sharpnessScore,
    };
  } catch (err) {
    console.error("Error analyzing image quality:", err);
    return { brightnessMean: 0.5, contrastScore: 0.5, sharpnessScore: 0 };
  }
}
