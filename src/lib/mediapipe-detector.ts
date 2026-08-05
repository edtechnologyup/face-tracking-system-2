// MediaPipe face detection and tracking utilities
import { FaceLandmarker, FilesetResolver, NormalizedLandmark } from '@mediapipe/tasks-vision';

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

export interface FaceTrackingData {
  isDetected: boolean;
  orientation: {
    yaw: number;
    pitch: number;
    isLookingAway: boolean;
    direction?: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER';
  };
  confidence: number;
  realTime: string; // เวลาจริงในรูปแบบ HH:mm:ss
  landmarks?: NormalizedLandmark[];
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

export class MediaPipeDetector {
  private faceLandmarker: FaceLandmarker | null = null;
  private isInitialized: boolean = false;
  private lastDetection: FaceTrackingData | null = null;
  
  // Auto-calibration system สำหรับ Pitch baseline
  private calibrationSamples: number[] = [];
  private calibrationComplete: boolean = false;
  private calibratedNeutralPosition: number = 0.58; // default value
  
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
  
  // Thresholds for direction detection
  private readonly YAW_THRESHOLD = 25;
  private readonly PITCH_THRESHOLD = 8;

  async initialize(): Promise<boolean> {
    try {
      console.log('🎯 เริ่มต้นโหลด MediaPipe FaceLandmarker...');
      
      // ลองวิธีโหลดแบบต่างๆ หากวิธีแรกไม่สำเร็จ
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      console.log('✅ FilesetResolver โหลดสำเร็จ');

      // ลองโหลด model แบบง่ายก่อน (ไม่ใช้ GPU)
      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "CPU"
        },
        outputFaceBlendshapes: false, // ปิดก่อนเพื่อลดภาระ
        outputFacialTransformationMatrixes: false, // ปิดก่อนเพื่อลดภาระ
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
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        numFaces: 3 // เพิ่มเป็น 3 เพื่อตรวจสอบหลายใบหน้า
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
        
        // ส่งข้อมูล real-time face detection loss
        if (this.onFaceDetectionLoss) {
          this.onFaceDetectionLoss(0);
        }
        
        const noFaceData: FaceTrackingData = {
          isDetected: false,
          orientation: { yaw: 0, pitch: 0, isLookingAway: false },
          confidence: 0,
          realTime: new Date().toLocaleTimeString('th-TH', { hour12: false }),
          multipleFaces: {
            count: 0,
            isSecurityRisk: false
          }, 
        };
        
        this.lastDetection = noFaceData;
        return noFaceData;
        
      }

      // ตรวจสอบจำนวนใบหน้าที่ตรวจพบ
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
      console.log('✅ พบใบหน้าเป้าหมายหลัก! landmarks:', landmarks.length, 'จุด (Index:', selectedFaceIdx, ')');
      
      // บันทึกว่าพบใบหน้าแล้ว (reset loss tracking)
      this.handleFaceDetectionRecovered();
      
      const trackingData = this.analyzeLandmarks(landmarks);
      
      // เพิ่มข้อมูลหลายใบหน้า
      trackingData.multipleFaces = multipleFacesData;
      
      console.log('📈 tracking data:', trackingData);
      
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

  private analyzeLandmarks(landmarks: NormalizedLandmark[]): FaceTrackingData {
    // คำนวณการหันหน้า (Face Orientation)
    const orientation = this.calculateFaceOrientation(landmarks);
    
    // คำนวณระยะห่างใบหน้าจากจอ
    const distance = this.calculateFaceDistance(landmarks);
    
    // สร้างเวลาจริง
    const realTime = new Date().toLocaleTimeString('th-TH', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit', 
      second: '2-digit'
    });
    
    // คำนวณระดับความมั่นใจแบบไดนามิก (ขึ้นอยู่กับองศาการหันศีรษะและระยะห่างจากกล้อง)
    let dynamicConfidence = 0.98;
    
    // ยิ่งหันมาก ความมั่นใจจะลดลงเล็กน้อยตามการบดบังของใบหน้า (Occlusion)
    dynamicConfidence -= (Math.abs(orientation.yaw) / 90) * 0.25;
    dynamicConfidence -= (Math.abs(orientation.pitch) / 90) * 0.15;
    
    // ปรับลดความมั่นใจเพิ่มเติมตามระยะห่าง (ระยะเหมาะสม 40 - 70 ซม.)
    if (distance) {
      const dist = distance.estimatedCm;
      if (dist < 40) {
        dynamicConfidence -= (40 - dist) * 0.005; // ใกล้เกินไป
      } else if (dist > 70) {
        dynamicConfidence -= (dist - 70) * 0.005; // ไกลเกินไป
      }
    }
    
    // จำกัดค่าความมั่นใจให้อยู่ในช่วง 0.50 - 0.98
    const finalConfidence = Math.max(0.50, Math.min(0.98, dynamicConfidence));
    
    return {
      isDetected: true,
      orientation,
      confidence: Number(finalConfidence.toFixed(3)),
      realTime,
      landmarks, // ส่ง landmarks ทั้ง 468 จุดไปให้ component
      distance
    };
  }

  private calculateFaceOrientation(landmarks: NormalizedLandmark[]) {
    // ใช้จุดสำคัญตาม MediaPipe FaceMesh 468 landmarks
    const noseTip = landmarks[1];        // จมูกปลาย
    const leftEyeInner = landmarks[133]; // มุมในตาซ้าย
    const rightEyeInner = landmarks[362]; // มุมในตาขวา
    const leftEyeOuter = landmarks[33];   // มุมนอกตาซ้าย  
    const rightEyeOuter = landmarks[263]; // มุมนอกตาขวา
    const chin = landmarks[18];           // คาง
    const forehead = landmarks[10];       // หน้าผาก

    // Debug: แสดง coordinates ของจุดสำคัญ
    console.log('🎯 Landmark Coordinates:', {
      noseTip: { x: noseTip.x, y: noseTip.y },
      leftEyeInner: { x: leftEyeInner.x, y: leftEyeInner.y },
      rightEyeInner: { x: rightEyeInner.x, y: rightEyeInner.y },
      leftEyeOuter: { x: leftEyeOuter.x, y: leftEyeOuter.y },
      rightEyeOuter: { x: rightEyeOuter.x, y: rightEyeOuter.y },
      chin: { x: chin.x, y: chin.y },
      forehead: { x: forehead.x, y: forehead.y }
    });

    // คำนวณ yaw (หันซ้าย-ขวา) ด้วยอัตราส่วนความยาวตา - **แก้ไขทิศทาง**
    const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x);
    const rightEyeWidth = Math.abs(rightEyeOuter.x - rightEyeInner.x);
    
    // **แก้ไขทิศทาง**: เมื่อหันซ้าย ratio < 1, เมื่อหันขวา ratio > 1
    // MediaPipe พิกัด: ตาซ้าย = มุมมองจากกล้อง (ด้านขวาของหน้าจอ), ตาขวา = ด้านซ้ายของหน้าจอ
    const eyeRatio = leftEyeWidth / rightEyeWidth; // คืนกลับเป็นเดิม
    let yaw = (1 - eyeRatio) * 100; // สลับเครื่องหมาย: (1 - ratio) แทน (ratio - 1)
    yaw = Math.max(-60, Math.min(60, yaw)); // จำกัด range
    
    // คำนวณ pitch (หันบน-ล่าง) ด้วยวิธีที่แม่นยำขึ้น
    const totalFaceHeight = Math.abs(chin.y - forehead.y);
    
    // ใช้ตำแหน่งสัมพัทธ์ของจมูกในใบหน้า (0-1 scale)
    const noseRelativePosition = (noseTip.y - forehead.y) / totalFaceHeight;
    
    // **แก้ไขการคำนวณ Pitch**: ใช้ baseline ที่แม่นยำขึ้น + Auto-calibration
    // Auto-calibration: เก็บ samples แรก 30 ครั้ง (3 วินาที) เป็น baseline
    if (!this.calibrationComplete && this.calibrationSamples.length < 30) {
      this.calibrationSamples.push(noseRelativePosition);
      console.log(`📊 Calibrating... Sample ${this.calibrationSamples.length}/30: ${noseRelativePosition.toFixed(4)}`);
      
      if (this.calibrationSamples.length === 30) {
        // คำนวณค่าเฉลี่ยเป็น neutral position ของผู้ใช้คนนี้
        const sum = this.calibrationSamples.reduce((a, b) => a + b, 0);
        this.calibratedNeutralPosition = sum / this.calibrationSamples.length;
        this.calibrationComplete = true;
        console.log(`✅ Auto-calibration complete! Personal neutral position: ${this.calibratedNeutralPosition.toFixed(4)}`);
      }
    }
    
    // ใช้ calibrated baseline หรือ default value
    const neutralNosePosition = this.calibratedNeutralPosition;
    
    // คำนวณส่วนเบี่ยงเบนจาก neutral position
    const pitchDeviation = noseRelativePosition - neutralNosePosition;
    
    // แปลงเป็นองศาด้วย sensitivity ที่ตอบสนองรวดเร็วเป็นธรรมชาติ
    let pitch = pitchDeviation * 140; 
    pitch = Math.max(-35, Math.min(35, pitch)); // จำกัด range ±35°

    // ตรวจสอบการหันออกจากจอ
    const isLookingAway = Math.abs(yaw) > this.YAW_THRESHOLD || Math.abs(pitch) > this.PITCH_THRESHOLD;

    // Debug logging ที่ละเอียดยิ่งขึ้น
    console.log(`🎯 Face Orientation Debug:`);
    console.log(`   Calibration: ${this.calibrationComplete ? 'Complete' : `In progress (${this.calibrationSamples.length}/30)`}`);
    console.log(`   Eye Widths - Left: ${leftEyeWidth.toFixed(4)}, Right: ${rightEyeWidth.toFixed(4)}`);
    console.log(`   Eye Ratio: ${eyeRatio.toFixed(4)}`);
    console.log(`   Face Height: ${totalFaceHeight.toFixed(4)}`);
    console.log(`   Nose Position: ${noseRelativePosition.toFixed(4)} (neutral=${neutralNosePosition.toFixed(4)})`);
    console.log(`   Pitch Deviation: ${pitchDeviation.toFixed(4)} -> ${pitch.toFixed(1)}° (should be ~0° when looking straight)`);
    console.log(`   Final - Yaw: ${yaw.toFixed(1)}°, Pitch: ${pitch.toFixed(1)}°, Away: ${isLookingAway}`);

    // กำหนดทิศทางการหันหน้า
    const direction = this.getOrientationDirection(yaw, pitch);
    
    // คำนวณความมั่นใจของเฟรมนี้แบบไดนามิกตามมุมหัน
    let frameConfidence = 0.98;
    frameConfidence -= (Math.abs(yaw) / 90) * 0.25;
    frameConfidence -= (Math.abs(pitch) / 90) * 0.15;
    const finalFrameConfidence = Math.max(0.50, Math.min(0.98, frameConfidence));

    // บันทึก orientation event หากกำลัง recording
    if (this.isRecording) {
      this.recordOrientationEvent(direction, yaw, pitch, finalFrameConfidence);
    }

    // ส่งข้อมูล real-time หาก callback ถูกตั้งค่าไว้
    if (this.onOrientationChange && direction !== this.lastSentDirection) {
      this.onOrientationChange(direction, yaw, pitch, Number(finalFrameConfidence.toFixed(3)));
      this.lastSentDirection = direction;
    }

    return { yaw, pitch, isLookingAway, direction };
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
    
    // ตรวจสอบว่าระยะห่างเกิน 80cm หรือไม่
    const DISTANCE_THRESHOLD_CM = 80;
    const isTooFar = estimatedCm > DISTANCE_THRESHOLD_CM;
    
    // Debug logging
    console.log(`📏 Distance Calculation:`, {
      faceWidth: faceWidth.toFixed(4),
      faceHeight: faceHeight.toFixed(4),
      distanceFromWidth: distanceFromWidth.toFixed(1),
      distanceFromHeight: distanceFromHeight.toFixed(1),
      estimatedCm: estimatedCm.toFixed(1),
      isTooFar,
      threshold: DISTANCE_THRESHOLD_CM
    });
    
    return {
      estimatedCm: Math.round(estimatedCm),
      isTooFar,
      faceWidth,
      faceHeight
    };
  }

  // === Orientation Tracking Methods ===
  
  private getOrientationDirection(yaw: number, pitch: number): 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER' {
    // ตรวจสอบ yaw ก่อน (หันซ้าย-ขวา)
    if (Math.abs(yaw) > this.YAW_THRESHOLD) {
      return yaw > 0 ? 'RIGHT' : 'LEFT';
    }
    
    // ตรวจสอบ pitch (ก้มหน้า-เงยหน้า)
    if (Math.abs(pitch) > this.PITCH_THRESHOLD) {
      return pitch > 0 ? 'DOWN' : 'UP';
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
      this.faceLandmarker = null;
    }
    this.isInitialized = false;
    this.lastDetection = null;
    
    // Reset calibration
    this.calibrationSamples = [];
    this.calibrationComplete = false;
    this.calibratedNeutralPosition = 0.58;
    
    // Clear real-time callbacks
    this.clearRealtimeCallbacks();
    
    console.log('🧹 MediaPipe detector ถูกล้างแล้ว (รวมถึง calibration data และ real-time callbacks)');
  }
}