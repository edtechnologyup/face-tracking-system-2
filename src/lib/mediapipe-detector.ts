// MediaPipe face detection and tracking utilities
import { FaceLandmarker, FilesetResolver, NormalizedLandmark, type Matrix } from '@mediapipe/tasks-vision';
import { estimateGazeFromLandmarks, type IrisGazeEstimate } from './gaze-estimation';
import { mapBlendshapesToActionUnits, type MappedActionUnits, type BlendshapeCategory } from './blendshape-action-units';
import { computeLandmarkConfidence, computeMediapipeFrameConfidence, computeHeadPoseConfidence } from './mediapipe-quality';
import { extractHeadPoseFromMatrix } from './mediapipe-head-pose';

// ซ่อน TensorFlow Lite INFO messages
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleError = console.error;

console.log = (...args) => {
  const message = args.join(' ');
  if (message.includes('Created TensorFlow Lite XNNPACK delegate for CPU') || 
      message.includes('TensorFlow Lite')) {
    return; // ไม่แสดง TensorFlow Lite messages
  }
  originalConsoleLog.apply(console, args);
};

console.info = (...args) => {
  const message = args.join(' ');
  if (message.includes('Created TensorFlow Lite XNNPACK delegate for CPU') || 
      message.includes('TensorFlow Lite')) {
    return; // ไม่แสดง TensorFlow Lite INFO messages
  }
  originalConsoleInfo.apply(console, args);
};

console.error = (...args) => {
  const message = args.join(' ');
  // กรอง TensorFlow Lite / MediaPipe / WebAssembly warnings และข้อผิดพลาดที่ไม่ร้ายแรง
  // เพื่อไม่ให้ Next.js Development Server แสดง Error Overlay สีแดง
  if (
    message.includes('TensorFlow Lite') ||
    message.includes('XNNPACK') ||
    message.includes('mediapipe') ||
    message.includes('wasm-function') ||
    message.includes('createConsoleError')
  ) {
    // เปลี่ยนจาก console.error เป็น console.warn เพื่อแสดงใน Console แต่ไม่แสดงหน้าจอแดง (Error Overlay) ของ Next.js
    console.warn('[MediaPipe Suppressed Error/Warning]:', ...args);
    return;
  }
  originalConsoleError.apply(console, args);
};

// CBMI Research Parameter Thresholds (from cbmi-parameter-guide.html)
export const YAW_THRESHOLD = 20; // 1. Raised from 15 to 20 to eliminate circularity and filter borderline tilts
export const PITCH_UP_THRESHOLD = 14.0;
export const PITCH_DOWN_THRESHOLD = 12.0;
export const HYSTERESIS_MARGIN = 5.0; // 2. Increased from 2 to 5 to prevent bouncing at threshold boundary
export const DISTANCE_THRESHOLD_CM = 70; // 5. Tightened from 80 to 70 for reliable pose estimation
export const BRIGHTNESS_MIN_THRESHOLD = 0.20; // 6. Flag degraded lighting condition when brightnessMean < 0.20
export const SUSTAINED_DURATION_SEC = 2; // 4. Filter out transient micro-movements (< 2s) before database logging
export const EAR_THRESHOLD = 0.10; // 3. Lowered from 0.25 to 0.10 to prevent normal blinks being flagged
export const HEAD_PITCH_DISENGAGEMENT_THRESHOLD = 10; // 3. Must be pitch > 10 alongside EAR < 0.10 for disengagement
export const OCCLUSION_VALID_THRESHOLD = 0.5; // phase/isValid: face partially occluded above this
export const OCCLUSION_SCENARIO_THRESHOLD = 0.8; // scenario label OCCLUSION above this

export interface FaceTrackingData {
  isDetected: boolean;
  isValid?: boolean; // Frame quality check (brightness >= 0.20, distance <= 70cm, single face)
  invalidReason?: string; // Reason why frame is not valid (e.g., 'LOW_BRIGHTNESS', 'FACE_TOO_FAR')
  orientation: {
    yaw: number;
    pitch: number;
    isLookingAway: boolean;
    direction?: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER';
  };
  confidence: number;
  landmarkConfidence?: number | null;
  headPoseConfidence?: number | null;
  headRoll?: number | null;
  orientationSource?: 'facialTransformationMatrix' | 'landmarkGeometry';
  realTime: string; // เวลาจริงในรูปแบบ HH:mm:ss
  landmarks?: NormalizedLandmark[];
  allFaceLandmarks?: NormalizedLandmark[][];
  multipleFaces?: {
    count: number;
    isSecurityRisk: boolean;
    warningMessage?: string;
  };
  distance?: {
    estimatedCm: number;
    isTooFar: boolean;
    faceWidth: number;
    faceHeight: number;
  };
  ear?: {
    leftEAR: number;
    rightEAR: number;
    avgEAR: number;
    isDisengaged: boolean;
  };
  quality?: {
    brightnessMean: number;
    isLowBrightness: boolean;
  };
  gaze?: IrisGazeEstimate;
  actionUnits?: MappedActionUnits | null;
}

// Interface สำหรับเก็บ Orientation Event ที่ละเอียด
export interface OrientationEvent {
  startTime: string; // เวลาจริงเริ่มต้น (HH:mm:ss)
  endTime?: string;  // เวลาจริงสิ้นสุด (HH:mm:ss)
  direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER';
  duration?: number; // ระยะเวลาเป็นวินาที
  maxYaw?: number;   // มุม yaw สูงสุดในช่วงนั้น
  maxPitch?: number; // มุม pitch สูงสุดในช่วงนั้น
  confidence?: number; // คะแนนความมั่นใจเฉลี่ย
  isActive: boolean; // กำลังเกิดขึ้นอยู่หรือไม่
}

export interface FaceDetectionLossEvent {
  startTime: string; // เวลาจริงเริ่มต้น (HH:mm:ss)
  endTime?: string;  // เวลาจริงสิ้นสุด (HH:mm:ss)
  duration?: number; // ระยะเวลาเป็นวินาที
  isActive: boolean; // กำลังเกิดขึ้นอยู่หรือไม่
  isMismatch?: boolean; // ใบหน้าไม่ตรงกับผู้สอบ
  reason?: string; // สาเหตุ
}

// Interface สำหรับสถิติการหันหน้า
export interface OrientationStats {
  totalEvents: number;
  leftTurns: { count: number; totalDuration: number };
  rightTurns: { count: number; totalDuration: number };
  lookingUp: { count: number; totalDuration: number };
  lookingDown: { count: number; totalDuration: number };
  centerTime: number; // เวลารวมที่มองตรง
  sessionStartTime: string;
  lastEventTime?: string;
}

/**
 * Adaptive One Euro Signal Filter (Casiez et al., CHI 2012)
 * Eliminates jitter when stationary while providing near-zero lag during fast movement.
 */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev: number = 0;
  private lastTime: number | null = null;

  constructor(minCutoff = 0.8, beta = 0.04, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(value: number, timestamp = performance.now()): number {
    if (this.lastTime === null || this.xPrev === null) {
      this.xPrev = value;
      this.dxPrev = 0;
      this.lastTime = timestamp;
      return value;
    }

    const dt = Math.max((timestamp - this.lastTime) / 1000, 0.001);
    this.lastTime = timestamp;

    const dx = (value - this.xPrev) / dt;
    const edx = (this.alpha(this.dCutoff, dt) * dx) + ((1 - this.alpha(this.dCutoff, dt)) * this.dxPrev);
    this.dxPrev = edx;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const a = this.alpha(cutoff, dt);
    const xFiltered = (a * value) + ((1 - a) * this.xPrev);
    this.xPrev = xFiltered;

    return xFiltered;
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.lastTime = null;
  }
}

export class MediaPipeDetector {
  private faceLandmarker: FaceLandmarker | null = null;
  private isInitialized: boolean = false;
  private lastDetection: FaceTrackingData | null = null;
  
  // Robust Outlier-Resistant Calibration System
  private calibrationPitchSamples: number[] = [];
  private calibrationYawSamples: number[] = [];
  private calibrationComplete: boolean = false;
  private neutralPitchBaseline: number = 0;
  private neutralYawBaseline: number = 0;
  
  // Adaptive Signal Filters (One Euro Filters for Yaw & Pitch)
  private yawFilter = new OneEuroFilter(0.8, 0.04);
  private pitchFilter = new OneEuroFilter(0.8, 0.04);

  // Orientation tracking system
  private currentOrientationEvent: OrientationEvent | null = null;
  private orientationHistory: OrientationEvent[] = [];
  private sessionStartTime: string = '';
  private isRecording: boolean = false;
  private currentEventConfidenceSum: number = 0;
  private currentEventConfidenceCount: number = 0;
  
  // Face detection loss tracking
  private currentFaceDetectionLossEvent: FaceDetectionLossEvent | null = null;
  private faceDetectionLossHistory: FaceDetectionLossEvent[] = [];
  private lastFaceDetectedTime: number = Date.now();
  private consecutiveLossFrames: number = 0;
  private readonly LOSS_THRESHOLD_FRAMES = 5; // ถือว่า loss เมื่อไม่พบ 5 frames ติด
  private lastTrackedFaceCenter: { x: number; y: number } | null = null; // จุดศูนย์กลางใบหน้าหลักที่บันทึกไว้ล่าสุด
  
  // Real-time tracking callbacks
  private onOrientationChange?: (direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER', yaw: number, pitch: number, confidence: number) => void;
  private onFaceDetectionLoss?: (confidence: number) => void;
  private lastSentDirection: string = '';
  
  // Thresholds & Hysteresis Margins for direction detection (CBMI Guide)
  private readonly YAW_THRESHOLD = YAW_THRESHOLD;
  private readonly PITCH_UP_THRESHOLD = PITCH_UP_THRESHOLD;
  private readonly PITCH_DOWN_THRESHOLD = PITCH_DOWN_THRESHOLD;
  private readonly HYSTERESIS_MARGIN = HYSTERESIS_MARGIN;
  private readonly DISTANCE_THRESHOLD_CM = DISTANCE_THRESHOLD_CM;
  private readonly BRIGHTNESS_MIN_THRESHOLD = BRIGHTNESS_MIN_THRESHOLD;
  private readonly SUSTAINED_DURATION_SEC = SUSTAINED_DURATION_SEC;
  private readonly EAR_THRESHOLD = EAR_THRESHOLD;
  private readonly HEAD_PITCH_DISENGAGEMENT_THRESHOLD = HEAD_PITCH_DISENGAGEMENT_THRESHOLD;

  // Offscreen canvas for fast brightness/luminance sampling
  private brightnessCanvas: HTMLCanvasElement | null = null;
  private brightnessCtx: CanvasRenderingContext2D | null = null;

  // Signal smoothing state
  private smoothedYaw: number = 0;
  private smoothedPitch: number = 0;
  private currentDirection: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER' = 'CENTER';

  async initialize(): Promise<boolean> {
    try {
      console.log('🎯 เริ่มต้นโหลด MediaPipe FaceLandmarker...');
      
      // ลองวิธีโหลดแบบต่างๆ หากวิธีแรกไม่สำเร็จ
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      console.log('✅ FilesetResolver โหลดสำเร็จ');

      // ใช้ GPU เพื่อลดความล่าช้า (Lag) ตอนเริ่มต้นและระหว่างจับใบหน้า
      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
        numFaces: 3 // เพิ่มเป็น 3 เพื่อตรวจสอบหลายใบหน้า
      });

      this.isInitialized = true;
      console.log('✅ MediaPipe FaceLandmarker พร้อมใช้งาน');
      return true;
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการโหลด MediaPipe:', error);
      console.error('รายละเอียดข้อผิดพลาด:', error instanceof Error ? error.message : String(error));
      
      // ลองวิธีสำรองหากไม่สำเร็จ
      return await this.initializeFallback();
    }
  }

  private async initializeFallback(): Promise<boolean> {
    try {
      console.log('🔄 ลองโหลด MediaPipe แบบสำรอง...');
      
      // ลองใช้ CDN ต่างออกไป
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
      );

      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "CPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
        numFaces: 3
      });

      this.isInitialized = true;
      console.log('✅ MediaPipe FaceLandmarker โหลดสำเร็จแบบสำรอง');
      return true;
    } catch (fallbackError) {
      console.error('❌ การโหลดแบบสำรองก็ไม่สำเร็จ:', fallbackError);
      return false;
    }
  }

  private getFaceCenter(landmarks: NormalizedLandmark[]): { x: number; y: number; area: number } {
    let minX = 1.0, maxX = 0.0, minY = 1.0, maxY = 0.0;
    for (const landmark of landmarks) {
      if (landmark.x < minX) minX = landmark.x;
      if (landmark.x > maxX) maxX = landmark.x;
      if (landmark.y < minY) minY = landmark.y;
      if (landmark.y > maxY) maxY = landmark.y;
    }
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      area: (maxX - minX) * (maxY - minY)
    };
  }

  async detectFromVideo(video: HTMLVideoElement): Promise<FaceTrackingData | null> {
    if (!this.isInitialized || !this.faceLandmarker) {
      console.warn('⚠️ MediaPipe ยังไม่พร้อมใช้งาน');
      return null;
    }

    try {
      // ตรวจสอบ video readiness และขนาดของวิดีโอ (ต้อง > 0 เพื่อป้องกัน WebAssembly Crash)
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn('⚠️ Video ยังไม่พร้อม readyState:', video?.readyState, 'dimensions:', video?.videoWidth, 'x', video?.videoHeight);
        return null;
      }

      // ตรวจสอบ faceLandmarker อีกครั้งก่อนเรียกใช้
      if (!this.faceLandmarker || typeof this.faceLandmarker.detectForVideo !== 'function') {
        console.error('❌ faceLandmarker ไม่พร้อมใช้งาน หรือ detectForVideo method ไม่พบ');
        return null;
      }

      const results = this.faceLandmarker.detectForVideo(video, performance.now());
      
      if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
        console.log('❌ ไม่พบใบหน้าใน MediaPipe results');
        
        // ล้างตำแหน่งใบหน้าที่ล็อคไว้
        this.lastTrackedFaceCenter = null;
        
        // บันทึก face detection loss
        this.handleFaceDetectionLoss();
        
        const brightnessMean = this.calculateBrightness(video);
        const isLowBrightness = brightnessMean < this.BRIGHTNESS_MIN_THRESHOLD;

        // หากก่อนหน้านี้กำลังก้มหน้าอยู่ (DOWN) แล้วแลนด์มาร์คหลุดชั่วคราวจากการก้มลึก ให้คงสถานะ DOWN ไว้ช่วงสั้นๆ (กรอบ 1-10)
        const isDeepBowingLoss = (this.currentDirection === 'DOWN' || this.smoothedPitch < -10.0) && this.consecutiveLossFrames <= 10;
        
        if (isDeepBowingLoss) {
          console.log(`👇 Deep Head Pitch Bowing: ก้มหน้าลึกพ้นระยะตรวจจับชั่วคราว (เฟรมที่ ${this.consecutiveLossFrames}) - รักษาสถานะ DOWN`);
          
          const deepBowingData: FaceTrackingData = {
            isDetected: true,
            isValid: !isLowBrightness,
            invalidReason: isLowBrightness ? 'LOW_BRIGHTNESS' : undefined,
            orientation: { 
              yaw: this.smoothedYaw, 
              pitch: Math.min(this.smoothedPitch, -20.0), 
              isLookingAway: true, 
              direction: 'DOWN' 
            },
            confidence: 0.75,
            realTime: new Date().toLocaleTimeString('th-TH', { hour12: false }),
            multipleFaces: {
              count: 1,
              isSecurityRisk: false
            },
            quality: {
              brightnessMean,
              isLowBrightness
            }
          };
          
          this.lastDetection = deepBowingData;
          return deepBowingData;
        }

        // ส่งข้อมูล real-time face detection loss
        if (this.onFaceDetectionLoss) {
          this.onFaceDetectionLoss(0);
        }
        
        const noFaceData: FaceTrackingData = {
          isDetected: false,
          isValid: false,
          invalidReason: isLowBrightness ? 'LOW_BRIGHTNESS' : 'NO_FACE_DETECTED',
          orientation: { yaw: 0, pitch: 0, isLookingAway: false },
          confidence: 0,
          realTime: new Date().toLocaleTimeString('th-TH', { hour12: false }),
          multipleFaces: {
            count: 0,
            isSecurityRisk: false
          },
          quality: {
            brightnessMean,
            isLowBrightness
          }
        };
        
        this.lastDetection = noFaceData;
        return noFaceData;
      }

      // กรองใบหน้าซ้ำซ้อนที่เกิดจาก Motion Blur เมื่อผู้สอบขยับใบหน้าอย่างรวดเร็ว (Spatial NMS / Distance Filter)
      const validFaceLandmarks: NormalizedLandmark[][] = [];
      const validFaceCenters: { x: number; y: number; area: number; idx: number }[] = [];

      for (let i = 0; i < results.faceLandmarks.length; i++) {
        const faceLm = results.faceLandmarks[i];
        const center = this.getFaceCenter(faceLm);
        
        let isMotionBlurGhost = false;
        for (const existing of validFaceCenters) {
          const dx = Math.abs(center.x - existing.x);
          const dy = Math.abs(center.y - existing.y);
          // หากจุดศูนย์กลางใบหน้า 2 ชุดอยู่ใกล้กันมาก (dx < 0.20 และ dy < 0.20) ถือเป็นภาพซ้อน motion blur ของคนเดียวกัน
          if (dx < 0.20 && dy < 0.20) {
            isMotionBlurGhost = true;
            break;
          }
        }

        if (!isMotionBlurGhost) {
          validFaceCenters.push({ idx: validFaceLandmarks.length, ...center });
          validFaceLandmarks.push(faceLm);
        }
      }

      results.faceLandmarks = validFaceLandmarks;

      // ตรวจสอบจำนวนใบหน้าที่ตรวจพบจริงหลังกรองภาพซ้อน
      const faceCount = results.faceLandmarks.length;
      const multipleFacesData = {
        count: faceCount,
        isSecurityRisk: faceCount > 1,
        warningMessage: faceCount > 1 ? 
          `⚠️ ตรวจพบ ${faceCount} ใบหน้า! อาจมีคนอื่นในการสอบ` : 
          undefined
      };

      // แจ้งเตือนในคอนโซลหากพบหลายใบหน้า
      if (faceCount > 1) {
        console.warn(`🚨 SECURITY ALERT: ตรวจพบ ${faceCount} ใบหน้า! อาจมีคนอื่นในการสอบ`);
      }

      // เลือกใบหน้าที่จะทำการติดตาม (Proximity Target Lock เพื่อแก้ปัญหาสลับใบหน้าตรวจจับ)
      let selectedFaceIdx = 0;
      
      if (faceCount > 1) {
        const faceCenters = results.faceLandmarks.map((faceLandmarksList, idx) => {
          const info = this.getFaceCenter(faceLandmarksList);
          return { idx, ...info };
        });

        if (this.lastTrackedFaceCenter === null) {
          // เริ่มติดตามใหม่: เลือกใบหน้าที่มีขนาดพื้นที่ใหญ่ที่สุด (อยู่หน้าสุดและใกล้สุด)
          faceCenters.sort((a, b) => b.area - a.area);
          selectedFaceIdx = faceCenters[0].idx;
          this.lastTrackedFaceCenter = { x: faceCenters[0].x, y: faceCenters[0].y };
          console.log(`🎯 [Face Tracker] เริ่มล็อคเป้าหมายการติดตามใบหน้าหลัก (ใบหน้าใหญ่สุด): Index ${selectedFaceIdx}`);
        } else {
          // กำลังติดตามอยู่: เลือกใบหน้าที่มีจุดศูนย์กลางใกล้เคียงกับใบหน้าที่ระบุล่าสุด
          let minDistance = Infinity;
          let bestIdx = 0;
          
          for (const face of faceCenters) {
            const dx = face.x - this.lastTrackedFaceCenter.x;
            const dy = face.y - this.lastTrackedFaceCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance) {
              minDistance = distance;
              bestIdx = face.idx;
            }
          }

          // ระยะทางห่างที่ยอมรับได้ (เช่น 0.25 ของกรอบวิดีโอ) เพื่อป้องกันการสลับตัวไปแทร็กบุคคลอื่น
          if (minDistance < 0.25) {
            selectedFaceIdx = bestIdx;
            const matchedFace = faceCenters.find(f => f.idx === bestIdx)!;
            this.lastTrackedFaceCenter = { x: matchedFace.x, y: matchedFace.y };
          } else {
            // หากหลุดระยะห่างที่กำหนด ให้ล็อคเป้าใบหน้าที่ใหญ่ที่สุดตัวใหม่
            faceCenters.sort((a, b) => b.area - a.area);
            selectedFaceIdx = faceCenters[0].idx;
            this.lastTrackedFaceCenter = { x: faceCenters[0].x, y: faceCenters[0].y };
            console.log(`🎯 [Face Tracker] เป้าหมายหลักหลุดระยะห่าง ค้นหาและเริ่มล็อคใบหน้าใหญ่สุดใหม่: Index ${selectedFaceIdx}`);
          }
        }
      } else {
        // หากมีใบหน้าเดียวในกล้อง ให้ล็อคพิกัดของใบหน้านั้น
        const info = this.getFaceCenter(results.faceLandmarks[0]);
        this.lastTrackedFaceCenter = { x: info.x, y: info.y };
        selectedFaceIdx = 0;
      }

      const landmarks = results.faceLandmarks[selectedFaceIdx];
      
      // บันทึกว่าพบใบหน้าแล้ว (reset loss tracking)
      this.handleFaceDetectionRecovered();
      
      const blendshapeCategories = results.faceBlendshapes?.[selectedFaceIdx]?.categories as BlendshapeCategory[] | undefined;
      const transformMatrix = results.facialTransformationMatrixes?.[selectedFaceIdx];
      const trackingData = this.analyzeLandmarks(landmarks, blendshapeCategories, transformMatrix);
      
      // เพิ่มข้อมูลหลายใบหน้า
      trackingData.multipleFaces = multipleFacesData;
      trackingData.allFaceLandmarks = results.faceLandmarks;
      
      // CBMI Guide Validity Checks: Brightness, Distance, Multiple Faces
      const brightnessMean = this.calculateBrightness(video);
      const isLowBrightness = brightnessMean < this.BRIGHTNESS_MIN_THRESHOLD;
      const isTooFar = !!trackingData.distance?.isTooFar;
      const hasMultipleFaces = !!multipleFacesData.isSecurityRisk;
      
      trackingData.quality = {
        brightnessMean,
        isLowBrightness
      };

      if (isLowBrightness) {
        trackingData.isValid = false;
        trackingData.invalidReason = 'LOW_BRIGHTNESS';
      } else if (isTooFar) {
        trackingData.isValid = false;
        trackingData.invalidReason = 'FACE_TOO_FAR';
      } else if (hasMultipleFaces) {
        trackingData.isValid = false;
        trackingData.invalidReason = 'MULTIPLE_FACES_DETECTED';
      } else {
        trackingData.isValid = true;
      }
      
      this.lastDetection = trackingData;
      return trackingData;
    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการตรวจจับใบหน้า:', error);
      return null;
    }
  }


  getLastDetection(): FaceTrackingData | null {
    return this.lastDetection;
  }

  /**
   * Re-calibrate neutral baseline position (Outlier-resistant zeroing)
   */
  recalibrate(): void {
    this.calibrationPitchSamples = [];
    this.calibrationYawSamples = [];
    this.calibrationComplete = false;
    this.neutralPitchBaseline = 0;
    this.neutralYawBaseline = 0;
    this.yawFilter.reset();
    this.pitchFilter.reset();
    console.log('🔄 Re-calibrating face neutral baseline position...');
  }

  /**
   * Fast luminance/brightness estimation (0.0 to 1.0) using downscaled 32x32 offscreen canvas
   */
  private calculateBrightness(video: HTMLVideoElement): number {
    try {
      if (typeof document === 'undefined' || !video || video.videoWidth === 0 || video.videoHeight === 0) {
        return 0.5;
      }
      if (!this.brightnessCanvas) {
        this.brightnessCanvas = document.createElement('canvas');
        this.brightnessCanvas.width = 32;
        this.brightnessCanvas.height = 32;
        this.brightnessCtx = this.brightnessCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (!this.brightnessCtx) return 0.5;

      this.brightnessCtx.drawImage(video, 0, 0, 32, 32);
      const imgData = this.brightnessCtx.getImageData(0, 0, 32, 32);
      const data = imgData.data;
      let sum = 0;
      const totalPixels = 32 * 32;
      for (let i = 0; i < data.length; i += 4) {
        sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      }
      return Number((sum / totalPixels).toFixed(3));
    } catch {
      return 0.5;
    }
  }

  /**
   * Calculate Eye Aspect Ratio (EAR) for both eyes using MediaPipe FaceMesh indices.
   * CBMI Guide: Flag disengagement ONLY if EAR < 0.10 AND headPitch > 10 simultaneously.
   */
  private calculateEAR(landmarks: NormalizedLandmark[], headPitch: number = 0): {
    leftEAR: number;
    rightEAR: number;
    avgEAR: number;
    isDisengaged: boolean;
  } {
    const computeEyeRatio = (p1: number, p2: number, p3: number, p4: number, p5: number, p6: number) => {
      const lm1 = landmarks[p1];
      const lm2 = landmarks[p2];
      const lm3 = landmarks[p3];
      const lm4 = landmarks[p4];
      const lm5 = landmarks[p5];
      const lm6 = landmarks[p6];
      if (!lm1 || !lm2 || !lm3 || !lm4 || !lm5 || !lm6) return 0.25;

      const v1 = Math.hypot(lm2.x - lm6.x, lm2.y - lm6.y);
      const v2 = Math.hypot(lm3.x - lm5.x, lm3.y - lm5.y);
      const h = Math.hypot(lm1.x - lm4.x, lm1.y - lm4.y) || 0.01;
      return (v1 + v2) / (2.0 * h);
    };

    // Left eye: 33 (outer), 160, 158 (top), 133 (inner), 153, 144 (bottom)
    const leftEAR = Number(computeEyeRatio(33, 160, 158, 133, 153, 144).toFixed(3));
    // Right eye: 362 (inner), 385, 387 (top), 263 (outer), 373, 380 (bottom)
    const rightEAR = Number(computeEyeRatio(362, 385, 387, 263, 373, 380).toFixed(3));
    const avgEAR = Number(((leftEAR + rightEAR) / 2).toFixed(3));

    // CBMI Guide: Flag disengagement ONLY if EAR < 0.10 AND headPitch > 10 simultaneously
    const isDisengaged = avgEAR < this.EAR_THRESHOLD && headPitch > this.HEAD_PITCH_DISENGAGEMENT_THRESHOLD;

    return {
      leftEAR,
      rightEAR,
      avgEAR,
      isDisengaged
    };
  }

  private analyzeLandmarks(
    landmarks: NormalizedLandmark[],
    blendshapeCategories?: BlendshapeCategory[],
    transformMatrix?: Matrix
  ): FaceTrackingData {
    // คำนวณการหันหน้า (Face Orientation) — matrix L1 หรือ landmark fallback
    const orientationResult = this.calculateFaceOrientation(landmarks, transformMatrix);
    
    // Iris + head gaze estimation
    const gaze = estimateGazeFromLandmarks(landmarks);
    const actionUnits = mapBlendshapesToActionUnits(blendshapeCategories);
    
    // คำนวณระยะห่างใบหน้าจากจอ
    const distance = this.calculateFaceDistance(landmarks);

    // คำนวณ Eye Aspect Ratio (EAR) และตรวจสอบ Disengagement ร่วมกับมุมก้ม (headPitch > 10)
    const ear = this.calculateEAR(landmarks, orientationResult.pitch);
    
    // สร้างเวลาจริง
    const realTime = new Date().toLocaleTimeString('th-TH', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit', 
      second: '2-digit'
    });
    
    const landmarkConf = computeLandmarkConfidence(landmarks);
    const frameConf = computeMediapipeFrameConfidence(landmarks, blendshapeCategories);
    const matrixConf = orientationResult.headPoseConfidence;
    const finalConfidence =
      frameConf != null && matrixConf != null
        ? Number(Math.min(1, frameConf * 0.7 + matrixConf * 0.3).toFixed(3))
        : frameConf ?? matrixConf ?? landmarkConf ?? 0.5;
    
    return {
      isDetected: true,
      orientation: {
        yaw: orientationResult.yaw,
        pitch: orientationResult.pitch,
        isLookingAway: orientationResult.isLookingAway,
        direction: orientationResult.direction,
      },
      confidence: finalConfidence,
      landmarkConfidence: landmarkConf,
      headPoseConfidence: orientationResult.headPoseConfidence,
      headRoll: orientationResult.roll,
      orientationSource: orientationResult.orientationSource,
      realTime,
      landmarks,
      distance,
      ear,
      gaze: gaze ?? undefined,
      actionUnits: actionUnits ?? null,
    };
  }

  private calculateFaceOrientation(landmarks: NormalizedLandmark[], transformMatrix?: Matrix): {
    yaw: number;
    pitch: number;
    roll: number | null;
    isLookingAway: boolean;
    direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER';
    headPoseConfidence: number | null;
    orientationSource: 'facialTransformationMatrix' | 'landmarkGeometry';
  } {
    const matrixPose = extractHeadPoseFromMatrix(transformMatrix);
    if (matrixPose) {
      return this.finalizeOrientationFromAngles(
        matrixPose.yaw,
        matrixPose.pitch,
        matrixPose.roll,
        matrixPose.confidence,
        'facialTransformationMatrix'
      );
    }

    return this.finalizeOrientationFromLandmarkGeometry(landmarks);
  }

  private finalizeOrientationFromAngles(
    rawYaw: number,
    rawPitch: number,
    roll: number,
    headPoseConfidence: number,
    orientationSource: 'facialTransformationMatrix' | 'landmarkGeometry'
  ) {
    if (!this.calibrationComplete) {
      this.calibrationPitchSamples.push(rawPitch);
      this.calibrationYawSamples.push(rawYaw);
      if (this.calibrationPitchSamples.length >= 30) {
        const sortedPitch = [...this.calibrationPitchSamples].sort((a, b) => a - b);
        const sortedYaw = [...this.calibrationYawSamples].sort((a, b) => a - b);
        const trimCount = Math.floor(sortedPitch.length * 0.15);
        const validPitch = sortedPitch.slice(trimCount, sortedPitch.length - trimCount);
        const validYaw = sortedYaw.slice(trimCount, sortedYaw.length - trimCount);
        this.neutralPitchBaseline = validPitch.reduce((a, b) => a + b, 0) / validPitch.length;
        this.neutralYawBaseline = validYaw.reduce((a, b) => a + b, 0) / validYaw.length;
        this.calibrationComplete = true;
      }
    }

    const adjustedYaw = rawYaw - this.neutralYawBaseline;
    let currentPitch = rawPitch - this.neutralPitchBaseline;
    currentPitch = Math.max(-35, Math.min(35, currentPitch));

    const smoothYaw = Number(this.yawFilter.filter(adjustedYaw).toFixed(1));
    const smoothPitch = Number(this.pitchFilter.filter(currentPitch).toFixed(1));
    this.smoothedYaw = smoothYaw;
    this.smoothedPitch = smoothPitch;

    const direction = this.getOrientationDirection(smoothYaw, smoothPitch);
    this.currentDirection = direction;
    const isLookingAway = direction !== 'CENTER';

    if (this.isRecording) {
      let frameConfidence = 0.98;
      frameConfidence -= (Math.abs(smoothYaw) / 90) * 0.25;
      frameConfidence -= (Math.abs(smoothPitch) / 90) * 0.15;
      const finalFrameConfidence = Math.max(0.5, Math.min(0.98, frameConfidence));
      this.recordOrientationEvent(direction, smoothYaw, smoothPitch, finalFrameConfidence);
    }

    if (this.onOrientationChange && direction !== this.lastSentDirection) {
      const eventConf = orientationSource === 'facialTransformationMatrix' ? headPoseConfidence : 0.85;
      this.onOrientationChange(direction, smoothYaw, smoothPitch, Number(eventConf.toFixed(3)));
      this.lastSentDirection = direction;
    }

    return {
      yaw: smoothYaw,
      pitch: smoothPitch,
      roll: Number(roll.toFixed(1)),
      isLookingAway,
      direction,
      headPoseConfidence,
      orientationSource,
    };
  }

  private finalizeOrientationFromLandmarkGeometry(landmarks: NormalizedLandmark[]) {
    // ใช้จุดสำคัญตาม MediaPipe FaceMesh 468 landmarks
    const noseTip = landmarks[1];        // จมูกปลาย
    const leftEyeInner = landmarks[133]; // มุมในตาซ้าย
    const rightEyeInner = landmarks[362]; // มุมในตาขวา
    const leftEyeOuter = landmarks[33];   // มุมนอกตาซ้าย  
    const rightEyeOuter = landmarks[263]; // มุมนอกตาขวา
    const chin = landmarks[18];           // คาง
    const forehead = landmarks[10];       // หน้าผาก

    // คำนวณ yaw (หันซ้าย-ขวา) พร้อมระบบชดเชยการกลอกตาแบบสลับทิศทาง (Eye-Head Counter-Rotation Compensation)
    const leftCheek = landmarks[234];     // โหนกแก้มซ้าย (บน unmirrored frame อยู่ฝั่งขวา X ≈ 0.80)
    const rightCheek = landmarks[454];    // โหนกแก้มขวา (บน unmirrored frame อยู่ฝั่งซ้าย X ≈ 0.20)
    const faceCenterX = (leftCheek.x + rightCheek.x) / 2;

    // เมื่อผู้สอบหันไปทางซ้ายของตัวเอง จมูกจะเลื่อนไปทางขวาของกล้อง (noseTip.x > faceCenterX) -> (faceCenterX - noseTip.x) ได้ค่าลบ (< 0) -> yaw < -15° (LEFT)
    // เมื่อผู้สอบหันไปทางขวาของตัวเอง จมูกจะเลื่อนไปทางซ้ายของกล้อง (noseTip.x < faceCenterX) -> (faceCenterX - noseTip.x) ได้ค่าบวก (> 0) -> yaw > +15° (RIGHT)
    const headYawDegrees = (faceCenterX - noseTip.x) * 160;

    const leftPupil = landmarks[468] || landmarks[470] || leftEyeOuter;
    const rightPupil = landmarks[473] || landmarks[475] || rightEyeOuter;
    const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x) || 0.05;
    const rightEyeWidth = Math.abs(rightEyeInner.x - rightEyeOuter.x) || 0.05;

    const leftEyeCenterX = (leftEyeInner.x + leftEyeOuter.x) / 2;
    const rightEyeCenterX = (rightEyeInner.x + rightEyeOuter.x) / 2;

    const leftPupilOffset = (leftPupil.x - leftEyeCenterX) / leftEyeWidth;
    const rightPupilOffset = (rightPupil.x - rightEyeCenterX) / rightEyeWidth;

    const irisGazeRelX = (leftPupilOffset + rightPupilOffset) / 2;
    const irisGazeDegrees = irisGazeRelX * 45;

    // Net Gaze Yaw: เมื่อหันหน้าไปทางซ้าย/ขวา รวมความเอียงโครงหน้าและม่านตาให้ทิศทางสอดคล้องกัน
    let yaw = headYawDegrees + irisGazeDegrees;
    yaw = Math.max(-60, Math.min(60, yaw));
    
    // คำนวณ pitch (หันบน-ล่าง) ด้วยวิธีที่แม่นยำขึ้น
    const totalFaceHeight = Math.abs(chin.y - forehead.y);
    
    // ใช้ตำแหน่งสัมพัทธ์ของจมูกในใบหน้า (0-1 scale)
    const noseRelativePosition = (noseTip.y - forehead.y) / totalFaceHeight;
    const pitchDeviation = 0.52 - noseRelativePosition; // Neutral nose position baseline ~0.52
    
    // Eyelid pupil Y offset
    const leftTop = landmarks[159] || leftPupil;
    const leftBottom = landmarks[145] || leftPupil;
    const rightTop = landmarks[386] || rightPupil;
    const rightBottom = landmarks[374] || rightPupil;

    const leftEyeHeight = Math.abs(leftBottom.y - leftTop.y) || 0.02;
    const rightEyeHeight = Math.abs(rightBottom.y - rightTop.y) || 0.02;

    const leftEyeCenterY = (leftTop.y + leftBottom.y) / 2;
    const rightEyeCenterY = (rightTop.y + rightBottom.y) / 2;

    const leftPupilOffsetY = (leftEyeCenterY - leftPupil.y) / leftEyeHeight;
    const rightPupilOffsetY = (rightEyeCenterY - rightPupil.y) / rightEyeHeight;
    const irisGazeRelY = (leftPupilOffsetY + rightPupilOffsetY) / 2;
    const irisGazePitchDegrees = irisGazeRelY * 25;

    // Raw Pitch ก่อนการ Calibrate (ปรับสมดุลความไว และชดเชย offset จาก +6.0 เหลือ +1.5°)
    const pitchScale = pitchDeviation > 0 ? 80 : 75;
    const rawPitch = (pitchDeviation * pitchScale) + irisGazePitchDegrees + 1.5; 

    // Trimmed-Mean Auto-calibration: เก็บ 30 samples แรกและกรองข้อมูลสุดโต่ง 15% (Outlier Trimming)
    if (!this.calibrationComplete) {
      this.calibrationPitchSamples.push(rawPitch);
      this.calibrationYawSamples.push(headYawDegrees);
      
      if (this.calibrationPitchSamples.length >= 30) {
        const sortedPitch = [...this.calibrationPitchSamples].sort((a, b) => a - b);
        const sortedYaw = [...this.calibrationYawSamples].sort((a, b) => a - b);
        const trimCount = Math.floor(sortedPitch.length * 0.15);
        const validPitch = sortedPitch.slice(trimCount, sortedPitch.length - trimCount);
        const validYaw = sortedYaw.slice(trimCount, sortedYaw.length - trimCount);

        this.neutralPitchBaseline = validPitch.reduce((a, b) => a + b, 0) / validPitch.length;
        this.neutralYawBaseline = validYaw.reduce((a, b) => a + b, 0) / validYaw.length;
        this.calibrationComplete = true;
        console.log(`✅ Robust Trimmed-Mean Calibration Complete! Personal Neutral Baseline -> Pitch: ${this.neutralPitchBaseline.toFixed(2)}°, Yaw: ${this.neutralYawBaseline.toFixed(2)}°`);
      }
    }

    // ชดเชยการลดลงของสัดส่วน 2D เมื่อหันซ้าย-ขวา (3D Yaw-Pitch Decoupling) ป้องกันตรวจจับเป็นก้มหน้าขณะหันซ้าย/ขวา
    const yawRad = (Math.abs(yaw) * Math.PI) / 180;
    const pitchYawCompensation = (1 - Math.cos(yawRad)) * 14.0;

    // คำนวณ Yaw/Pitch สัมพัทธ์กับตำแหน่ง neutral baseline เฉพาะตัวของผู้ใช้
    const adjustedYaw = yaw - this.neutralYawBaseline;
    let currentPitch = (rawPitch - this.neutralPitchBaseline) + pitchYawCompensation;

    // ชดเชยการเงยหน้ามุมสูงมากๆ (Extreme Upward Pitch Detection Boost)
    const eyeNoseDistanceY = noseTip.y - ((leftEyeCenterY + rightEyeCenterY) / 2);
    if (totalFaceHeight < 0.15 && eyeNoseDistanceY < 0.028 && pitchDeviation > 0.06 && Math.abs(adjustedYaw) < 25) {
      currentPitch = Math.max(currentPitch, 16.0);
    }

    currentPitch = Math.max(-35, Math.min(35, currentPitch));

    // Adaptive One Euro Signal Filtering (กรองสัญญาณรบกวน ลด Delay และขจัด Jitter 100%)
    const smoothYaw = Number(this.yawFilter.filter(adjustedYaw).toFixed(1));
    const smoothPitch = Number(this.pitchFilter.filter(currentPitch).toFixed(1));
    this.smoothedYaw = smoothYaw;
    this.smoothedPitch = smoothPitch;

    // กำหนดทิศทางการหันหน้าพร้อม Hysteresis
    const direction = this.getOrientationDirection(smoothYaw, smoothPitch);
    this.currentDirection = direction;

    // ตรวจสอบการหันออกจากจอ
    const isLookingAway = direction !== 'CENTER';

    // คำนวณความมั่นใจของเฟรมนี้แบบไดนามิกตามมุมหัน
    let frameConfidence = 0.98;
    frameConfidence -= (Math.abs(smoothYaw) / 90) * 0.25;
    frameConfidence -= (Math.abs(smoothPitch) / 90) * 0.15;
    const finalFrameConfidence = Math.max(0.50, Math.min(0.98, frameConfidence));

    // บันทึก orientation event หากกำลัง recording
    if (this.isRecording) {
      this.recordOrientationEvent(direction, smoothYaw, smoothPitch, finalFrameConfidence);
    }

    // ส่งข้อมูล real-time หาก callback ถูกตั้งค่าไว้
    if (this.onOrientationChange && direction !== this.lastSentDirection) {
      this.onOrientationChange(direction, smoothYaw, smoothPitch, Number(finalFrameConfidence.toFixed(3)));
      this.lastSentDirection = direction;
    }

    let roll: number | null = null;
    if (landmarks[33] && landmarks[362]) {
      const dx = landmarks[362].x - landmarks[33].x;
      const dy = landmarks[362].y - landmarks[33].y;
      roll = Number((Math.atan2(dy, dx) * (180 / Math.PI)).toFixed(1));
    }

    return {
      yaw: smoothYaw,
      pitch: smoothPitch,
      roll,
      isLookingAway,
      direction,
      headPoseConfidence: computeHeadPoseConfidence(landmarks),
      orientationSource: 'landmarkGeometry' as const,
    };
  }

  private calculateFaceDistance(landmarks: NormalizedLandmark[]) {
    // ใช้จุดสำคัญสำหรับคำนวณขนาดใบหน้า
    const leftEar = landmarks[234];      // หูซ้าย
    const rightEar = landmarks[454];     // หูขวา
    const forehead = landmarks[10];      // หน้าผาก
    const chin = landmarks[152];         // คาง
    
    // คำนวณความกว้างและความสูงใบหน้า (normalized coordinates 0-1)
    const faceWidth = Math.abs(leftEar.x - rightEar.x);
    const faceHeight = Math.abs(forehead.y - chin.y);
    
    // Constants สำหรับการคำนวณระยะห่าง
    // ความกว้างใบหน้าเฉลี่ย = 14-16 cm
    // ความสูงใบหน้าเฉลี่ย = 18-20 cm
    const AVERAGE_FACE_WIDTH_CM = 15;
    const AVERAGE_FACE_HEIGHT_CM = 19;
    
    // คำนวณระยะห่างจากขนาดใบหน้าที่ตรวจพบ
    // สูตร: distance = (actual_size_cm * focal_length) / pixel_size
    // ใช้ค่าประมาณ focal length = 500-600 pixels สำหรับ webcam ทั่วไป
    const FOCAL_LENGTH_ESTIMATE = 550;
    
    // คำนวณระยะห่างจากความกว้างและความสูง แล้วเอาค่าเฉลี่ย
    const distanceFromWidth = (AVERAGE_FACE_WIDTH_CM * FOCAL_LENGTH_ESTIMATE) / (faceWidth * 1000);
    const distanceFromHeight = (AVERAGE_FACE_HEIGHT_CM * FOCAL_LENGTH_ESTIMATE) / (faceHeight * 1000);
    
    // ใช้ค่าเฉลี่ยของทั้งสองวิธี
    const estimatedCm = (distanceFromWidth + distanceFromHeight) / 2;
    
    // ตรวจสอบว่าระยะห่างเกิน 70cm หรือไม่ (CBMI Guide: ปรับจาก 80cm เหลือ 70cm)
    const isTooFar = estimatedCm > this.DISTANCE_THRESHOLD_CM;
    
    return {
      estimatedCm: Math.round(estimatedCm),
      isTooFar,
      faceWidth,
      faceHeight
    };
  }

  // === Orientation Tracking Methods ===
  
  private getOrientationDirection(yaw: number, pitch: number): 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER' {
    const margin = this.HYSTERESIS_MARGIN;

    // 1. Hysteresis Check: หากอยู่ในทิศทางเดิมอยู่แล้ว ให้คงสถานะไว้จนกว่าจะลดลงต่ำกว่าเกณฑ์
    if (this.currentDirection === 'RIGHT') {
      if (yaw > (this.YAW_THRESHOLD - margin) && Math.abs(yaw) >= Math.abs(pitch) - margin) return 'RIGHT';
    } else if (this.currentDirection === 'LEFT') {
      if (yaw < -(this.YAW_THRESHOLD - margin) && Math.abs(yaw) >= Math.abs(pitch) - margin) return 'LEFT';
    } else if (this.currentDirection === 'UP') {
      if (pitch > (this.PITCH_UP_THRESHOLD - margin) && pitch >= Math.abs(yaw) - margin) return 'UP';
    } else if (this.currentDirection === 'DOWN') {
      if (pitch < -(this.PITCH_DOWN_THRESHOLD - margin) && Math.abs(pitch) >= Math.abs(yaw) - margin) return 'DOWN';
    }

    // 2. Dominant Axis Priority: เปรียบเทียบแกนหลักในการเคลื่อนที่เมื่อมีการเฉียง (เช่น หันซ้าย + เงยหน้านิดนึง)
    const absYaw = Math.abs(yaw);
    const absPitch = Math.abs(pitch);

    const isYawActive = absYaw > this.YAW_THRESHOLD;
    const isPitchUpActive = pitch > this.PITCH_UP_THRESHOLD;
    const isPitchDownActive = pitch < -this.PITCH_DOWN_THRESHOLD;

    // หากเกินเกณฑ์ทั้งสองแกนพร้อมกัน ให้ตัดตามแกนที่หันเอียงมากกว่า (Dominant Vector)
    if (isYawActive && (isPitchUpActive || isPitchDownActive)) {
      if (absYaw >= absPitch) {
        return yaw > 0 ? 'RIGHT' : 'LEFT';
      } else {
        return pitch > 0 ? 'UP' : 'DOWN';
      }
    }

    // หากเกินเกณฑ์เฉพาะ Yaw (หันซ้าย-ขวา)
    if (isYawActive) {
      return yaw > 0 ? 'RIGHT' : 'LEFT';
    }

    // หากเกินเกณฑ์เฉพาะ Pitch (ก้ม-เงย)
    if (isPitchUpActive) {
      return 'UP';
    }
    if (isPitchDownActive) {
      return 'DOWN';
    }

    return 'CENTER';
  }
  
  private recordOrientationEvent(direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER', yaw: number, pitch: number, confidence: number): void {
    const currentTime = new Date().toLocaleTimeString('th-TH', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit', 
      second: '2-digit'
    });
    
    // หากทิศทางเปลี่ยน หรือไม่มี event ปัจจุบัน
    if (!this.currentOrientationEvent || this.currentOrientationEvent.direction !== direction) {
      
      // จบ event เก่า (ถ้ามี)
      if (this.currentOrientationEvent && this.currentOrientationEvent.isActive) {
        this.finishCurrentEvent(currentTime);
      }
      
      // ตั้งค่าเริ่มต้นสะสมความมั่นใจ
      this.currentEventConfidenceSum = confidence;
      this.currentEventConfidenceCount = 1;
      
      // เริ่ม event ใหม่
      this.currentOrientationEvent = {
        startTime: currentTime,
        direction,
        maxYaw: Math.abs(yaw),
        maxPitch: Math.abs(pitch),
        isActive: true
      };
      
      console.log(`🎯 เริ่มต้น ${direction} event ที่เวลา ${currentTime}`);
    } else {
      // อัปเดต max values ของ event ปัจจุบัน
      if (this.currentOrientationEvent) {
        this.currentOrientationEvent.maxYaw = Math.max(this.currentOrientationEvent.maxYaw || 0, Math.abs(yaw));
        this.currentOrientationEvent.maxPitch = Math.max(this.currentOrientationEvent.maxPitch || 0, Math.abs(pitch));
        
        // สะสมความมั่นใจเพิ่มเติม
        this.currentEventConfidenceSum += confidence;
        this.currentEventConfidenceCount += 1;
      }
    }
  }
  
  private finishCurrentEvent(endTime: string): void {
    if (!this.currentOrientationEvent || !this.currentOrientationEvent.isActive) return;
    
    // คำนวณระยะเวลา
    const startTime = this.parseTimeString(this.currentOrientationEvent.startTime);
    const endTimeMs = this.parseTimeString(endTime);
    const duration = Math.round((endTimeMs - startTime) / 1000); // แปลงเป็นวินาที
    
    // คำนวณค่าความมั่นใจเฉลี่ย
    const avgConfidence = this.currentEventConfidenceCount > 0
      ? Number((this.currentEventConfidenceSum / this.currentEventConfidenceCount).toFixed(3))
      : 0.95;

    // บันทึก event ที่สมบูรณ์
    const completedEvent: OrientationEvent = {
      ...this.currentOrientationEvent,
      endTime,
      duration,
      confidence: avgConfidence,
      isActive: false
    };
    
    this.orientationHistory.push(completedEvent);
    if (this.orientationHistory.length > 1000) {
      this.orientationHistory = this.orientationHistory.slice(-1000);
    }
    
    console.log(`✅ จบ ${completedEvent.direction} event: ${completedEvent.duration} วินาที (${completedEvent.startTime} - ${completedEvent.endTime}) | Avg Confidence: ${avgConfidence}`);
    console.log(`   Max Yaw: ${completedEvent.maxYaw?.toFixed(1)}°, Max Pitch: ${completedEvent.maxPitch?.toFixed(1)}°`);
  }
  
  private parseTimeString(timeStr: string): number {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    return hours * 3600000 + minutes * 60000 + seconds * 1000; // milliseconds
  }
  
  // === Session Management ===
  
  startRecording(): void {
    this.isRecording = true;
    this.sessionStartTime = new Date().toLocaleTimeString('th-TH', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit', 
      second: '2-digit'
    });
    this.orientationHistory = [];
    this.currentOrientationEvent = null;
    
    // Reset face detection loss statistics เมื่อเริ่ม session ใหม่
    this.resetFaceDetectionLossStats();
    
    console.log(`🎬 เริ่มบันทึก orientation tracking ที่เวลา ${this.sessionStartTime}`);
    console.log(`🔄 Reset face detection loss statistics สำหรับ session ใหม่`);
  }
  
  stopRecording(): OrientationEvent[] {
    this.isRecording = false;
    
    // จบ event ปัจจุบัน (ถ้ามี)
    if (this.currentOrientationEvent && this.currentOrientationEvent.isActive) {
      const currentTime = new Date().toLocaleTimeString('th-TH', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit', 
        second: '2-digit'
      });
      this.finishCurrentEvent(currentTime);
    }
    
    console.log(`🛑 หยุดบันทึก orientation tracking`);
    console.log(`📊 รวม ${this.orientationHistory.length} events ที่บันทึกไว้`);
    
    return [...this.orientationHistory]; // return copy
  }
  
  getOrientationStats(): OrientationStats {
    const stats: OrientationStats = {
      totalEvents: this.orientationHistory.length,
      leftTurns: { count: 0, totalDuration: 0 },
      rightTurns: { count: 0, totalDuration: 0 },
      lookingUp: { count: 0, totalDuration: 0 },
      lookingDown: { count: 0, totalDuration: 0 },
      centerTime: 0,
      sessionStartTime: this.sessionStartTime,
      lastEventTime: this.orientationHistory[this.orientationHistory.length - 1]?.endTime
    };
    
    this.orientationHistory.forEach(event => {
      const duration = event.duration || 0;
      
      switch (event.direction) {
        case 'LEFT':
          stats.leftTurns.count++;
          stats.leftTurns.totalDuration += duration;
          break;
        case 'RIGHT':
          stats.rightTurns.count++;
          stats.rightTurns.totalDuration += duration;
          break;
        case 'UP':
          stats.lookingUp.count++;
          stats.lookingUp.totalDuration += duration;
          break;
        case 'DOWN':
          stats.lookingDown.count++;
          stats.lookingDown.totalDuration += duration;
          break;
        case 'CENTER':
          stats.centerTime += duration;
          break;
      }
    });
    
    return stats;
  }
  
  getDetailedOrientationHistory(): OrientationEvent[] {
    return [...this.orientationHistory];
  }

  /**
   * Return orientation events sustained for at least minDurationSec (CBMI Guide: 2 sec filter)
   */
  getSustainedOrientationEvents(minDurationSec: number = this.SUSTAINED_DURATION_SEC): OrientationEvent[] {
    return this.orientationHistory.filter(event => (event.duration || 0) >= minDurationSec);
  }
  
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  // === Face Detection Loss Management ===
  
  private handleFaceDetectionLoss(): void {
    this.consecutiveLossFrames++;
    
    // ถ้าเป็นครั้งแรกที่ loss (consecutive frames >= threshold)
    if (this.consecutiveLossFrames === this.LOSS_THRESHOLD_FRAMES) {
      const now = new Date();
      const startTime = now.toLocaleTimeString('th-TH', { hour12: false });
      
      this.currentFaceDetectionLossEvent = {
        startTime,
        isActive: true
      };
      
      console.log(`🚨 Face Detection Loss Event - เริ่มต้น loss event`);
      console.log(`   Consecutive loss frames: ${this.consecutiveLossFrames}`);
      console.log(`   เวลาเริ่ม loss: ${startTime}`);
    }
    
    // หากยังคง loss ต่อเนื่อง
    if (this.consecutiveLossFrames > this.LOSS_THRESHOLD_FRAMES) {
      console.log(`⏳ Face Detection Loss ยังคงดำเนินต่อ... frame ${this.consecutiveLossFrames}`);
    }
  }
  
  private handleFaceDetectionRecovered(): void {
    // หากกำลัง loss อยู่และเพิ่งพบใบหน้าอีกครั้ง
    if (this.consecutiveLossFrames >= this.LOSS_THRESHOLD_FRAMES && this.currentFaceDetectionLossEvent) {
      const now = new Date();
      const endTime = now.toLocaleTimeString('th-TH', { hour12: false });
      
      // คำนวณระยะเวลา
      const startTimeParts = this.currentFaceDetectionLossEvent.startTime.split(':');
      const endTimeParts = endTime.split(':');
      
      const startTimeMs = (parseInt(startTimeParts[0]) * 3600 + parseInt(startTimeParts[1]) * 60 + parseInt(startTimeParts[2])) * 1000;
      const endTimeMs = (parseInt(endTimeParts[0]) * 3600 + parseInt(endTimeParts[1]) * 60 + parseInt(endTimeParts[2])) * 1000;
      
      const duration = Math.max(1, Math.round((endTimeMs - startTimeMs) / 1000));
      
      // อัพเดท event และเพิ่มลง history
      this.currentFaceDetectionLossEvent.endTime = endTime;
      this.currentFaceDetectionLossEvent.duration = duration;
      this.currentFaceDetectionLossEvent.isActive = false;
      
      this.faceDetectionLossHistory.push({ ...this.currentFaceDetectionLossEvent });
      if (this.faceDetectionLossHistory.length > 1000) {
        this.faceDetectionLossHistory = this.faceDetectionLossHistory.slice(-1000);
      }
      
      console.log(`✅ Face Detection Recovered! Loss Event สิ้นสุด`);
      console.log(`   ระยะเวลา loss: ${duration} วินาที`);
      console.log(`   เวลา: ${this.currentFaceDetectionLossEvent.startTime} → ${endTime}`);
      console.log(`   รวม loss events: ${this.faceDetectionLossHistory.length} ครั้ง`);
      
      // Reset current event
      this.currentFaceDetectionLossEvent = null;
    }
    
    // Reset consecutive loss frames counter
    this.consecutiveLossFrames = 0;
    this.lastFaceDetectedTime = Date.now();
  }
  
  getFaceDetectionLossStats(): { lossCount: number; totalLossTime: number } {
    const totalLossTime = this.faceDetectionLossHistory.reduce((total, event) => total + (event.duration || 0), 0);
    return {
      lossCount: this.faceDetectionLossHistory.length,
      totalLossTime
    };
  }
  
  getFaceDetectionLossEvents(): FaceDetectionLossEvent[] {
    return [...this.faceDetectionLossHistory];
  }
  
  recordFaceMismatchEvent(startTime: string, endTime: string, duration: number): void {
    const mismatchEvent: FaceDetectionLossEvent = {
      startTime,
      endTime,
      duration,
      isActive: false,
      isMismatch: true,
      reason: 'different_person'
    };
    
    this.faceDetectionLossHistory.push(mismatchEvent);
    console.log(`🚨 บันทึก Face Mismatch Event: ${startTime} → ${endTime} (${duration} วิ)`);
  }

  resetFaceDetectionLossStats(): void {
    this.faceDetectionLossHistory = [];
    this.currentFaceDetectionLossEvent = null;
    this.consecutiveLossFrames = 0;
    this.lastFaceDetectedTime = Date.now();
    
    console.log('🔄 Reset face detection loss statistics');
  }



  // === Real-time Tracking Methods ===
  
  setRealtimeCallbacks(
    onOrientationChange?: (direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER', yaw: number, pitch: number, confidence: number) => void,
    onFaceDetectionLoss?: (confidence: number) => void
  ): void {
    this.onOrientationChange = onOrientationChange;
    this.onFaceDetectionLoss = onFaceDetectionLoss;
    this.lastSentDirection = '';
    console.log('📡 Real-time tracking callbacks ตั้งค่าเรียบร้อย');
  }
  
  clearRealtimeCallbacks(): void {
    this.onOrientationChange = undefined;
    this.onFaceDetectionLoss = undefined;
    this.lastSentDirection = '';
    console.log('📡 Real-time tracking callbacks ถูกลบแล้ว');
  }

  destroy(): void {
    if (this.faceLandmarker) {
      try {
        if (typeof this.faceLandmarker.close === 'function') {
          this.faceLandmarker.close();
        }
      } catch (err) {
        console.warn('WASM close warning:', err);
      }
      this.faceLandmarker = null;
    }
    this.isInitialized = false;
    this.lastDetection = null;
    
    // Reset calibration & filters
    this.calibrationPitchSamples = [];
    this.calibrationYawSamples = [];
    this.calibrationComplete = false;
    this.neutralPitchBaseline = 0;
    this.neutralYawBaseline = 0;
    this.yawFilter.reset();
    this.pitchFilter.reset();
    
    // Reset histories to free memory
    this.orientationHistory = [];
    this.faceDetectionLossHistory = [];
    
    // Clear real-time callbacks
    this.clearRealtimeCallbacks();

    // Release brightness canvas
    this.brightnessCanvas = null;
    this.brightnessCtx = null;
    
    console.log('🧹 MediaPipe detector ถูกล้างแล้ว (รวมถึง calibration data และ real-time callbacks)');
  }
}