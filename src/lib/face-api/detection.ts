// ซ่อนคำเตือนของ TensorFlow.js (TFJS) จาก Console
if (typeof console !== 'undefined') {
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('cpu backend was already registered') || 
        msg.includes('Platform node has already been set')) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  };
}

import * as faceApiImport from "face-api.js";
import { EAR_THRESHOLD, HEAD_PITCH_DISENGAGEMENT_THRESHOLD } from '@/lib/cbmi-parameters';

// แก้ปัญหาการนำเข้า face-api.js ใน Next.js (รองรับทั้ง ESM และ CommonJS)
const faceApiImportUnknown: unknown = faceApiImport;
const faceapi: typeof faceApiImport = 
  (faceApiImportUnknown && typeof faceApiImportUnknown === 'object' && 'default' in faceApiImportUnknown)
    ? (faceApiImportUnknown as { default: typeof faceApiImport }).default
    : faceApiImport;

// ตัวแปรสำหรับจัดการสถานะการโหลดโมเดล
let isModelLoaded = false;
let isLoading = false;

// URL ของโมเดลเปลี่ยนไปดึงจาก CDN (UNPKG) เพื่อลดภาระเซิร์ฟเวอร์
const PRIMARY_MODEL_URL = "https://unpkg.com/@vladmandic/face-api@1.7.12/model";
const FALLBACK_MODEL_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";
const UNPKG_MODEL_URL = "https://unpkg.com/@vladmandic/face-api@1.7.12/model";

/**
 * โหลดโมเดล AI สำหรับการตรวจจับใบหน้า
 * รองรับการโหลดแบบ concurrent และมี error handling
 */
export async function loadFaceApiModels() {
  if (isModelLoaded) {
    console.log("โมเดลถูกโหลดแล้ว");
    return;
  }

  if (isLoading) {
    console.log("กำลังโหลดโมเดล...");
    return new Promise((resolve) => {
      const checkLoaded = setInterval(() => {
        if (isModelLoaded) {
          clearInterval(checkLoaded);
          resolve(true);
        }
      }, 100);
    });
  }

  isLoading = true;
  console.log("กำลังโหลดโมเดล face-api (จาก Local Server)...");

  try {
    // โหลดแบบ Local
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(PRIMARY_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(PRIMARY_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(PRIMARY_MODEL_URL),
    ]);

    isModelLoaded = true;
    isLoading = false;
    console.log("โหลดโมเดล face-api สำเร็จจาก Local Server อย่างรวดเร็ว 🚀");
    return;
  } catch (error) {
    console.warn("ไม่สามารถโหลดโมเดลจาก Local ได้ กำลังลองโหลดจาก GitHub Raw...", error);
  }

  try {
    console.log("กำลังโหลดโมเดล face-api (จาก GitHub Raw)...");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FALLBACK_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FALLBACK_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FALLBACK_MODEL_URL),
    ]);

    isModelLoaded = true;
    isLoading = false;
    console.log("โหลดโมเดล face-api สำเร็จจาก GitHub Raw");
    return;
  } catch (error) {
    console.warn("ไม่สามารถโหลดโมเดลจาก GitHub Raw ได้ กำลังลองโหลดจาก Unpkg...", error);
  }

  try {
    console.log("กำลังโหลดโมเดล face-api (จาก Unpkg CDN)...");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(UNPKG_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(UNPKG_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(UNPKG_MODEL_URL),
    ]);

    isModelLoaded = true;
    isLoading = false;
    console.log("โหลดโมเดล face-api สำเร็จจาก Unpkg CDN");
  } catch (error) {
    isLoading = false;
    console.error("ข้อผิดพลาดในการโหลดโมเดล face-api ทั้งสามแหล่ง:", error);
    throw new Error("ไม่สามารถโหลดโมเดล AI ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต");
  }
}

/**
 * ตรวจจับใบหน้าและสร้าง face descriptor สำหรับการเปรียบเทียบ
 * @param imageElement - วีดีโอหรือภาพที่จะตรวจจับ
 * @param skipValidation - ข้ามการตรวจสอบคุณภาพ (default: false)
 * @returns Array ของ face descriptor (128 มิติ)
 */
export async function detectFaceAndGetDescriptor(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  skipValidation: boolean = false
): Promise<number[]> {
  try {
    // ตรวจสอบว่าโมเดลโหลดแล้วหรือยัง
    if (!isModelLoaded) {
      await loadFaceApiModels();
    }

    console.log("กำลังตรวจจับใบหน้า...");

    // ตั้งค่าการตรวจจับใบหน้า (ใช้ inputSize 416 และ scoreThreshold 0.15 เพื่อตรวจจับได้ง่าย รวดเร็ว และแม่นยำทุกสภาพแสง)
    const detectionOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.15
    });

    // ตรวจจับใบหน้าพร้อมจุดสำคัญและลายเซ็นใบหน้า
    const detection = await faceapi
      .detectSingleFace(imageElement, detectionOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      throw new Error("ไม่พบใบหน้าในภาพ กรุณาจัดตำแหน่งใบหน้าให้อยู่ในกรอบ");
    }

    // ตรวจสอบความมั่นใจในการตรวจจับ (ถ้าไม่ได้ระบุให้ข้าม)
    if (!skipValidation && detection.detection.score < 0.15) {
      throw new Error("คุณภาพการตรวจจับใบหน้าไม่เพียงพอ กรุณาปรับแสงและตำแหน่ง");
    }

    console.log("ตรวจจับใบหน้าสำเร็จ, คะแนน:", detection.detection.score);

    // ส่งคืนลายเซ็นใบหน้า
    return Array.from(detection.descriptor);

  } catch (error: unknown) {
    console.error("ข้อผิดพลาดในการตรวจจับใบหน้า:", error);
    
    if (error instanceof Error && (error.message.includes("ไม่พบใบหน้า") || error.message.includes("คุณภาพ"))) {
      throw error; // ส่งต่อ error message ที่เป็นไทย
    }
    
    throw new Error("เกิดข้อผิดพลาดในการตรวจจับใบหน้า กรุณาลองใหม่อีกครั้ง");
  }
}

/**
 * ตรวจจับใบหน้าและวิเคราะห์ท่าพร้อมการกระพริบตา
 * @param imageElement - วีดีโอหรือภาพที่จะตรวจจับ
 * @returns ผลการตรวจจับและวิเคราะห์
 */
export async function detectFacePose(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<{
  detected: boolean;
  pose: 'front' | 'left' | 'right' | 'unknown';
  confidence: number;
  landmarks?: faceApiImport.FaceLandmarks68;
  isBlinking?: boolean;
}> {
  try {
    if (!isModelLoaded) {
      await loadFaceApiModels();
    }

    const detectionOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.15
    });

    const detection = await faceapi
      .detectSingleFace(imageElement, detectionOptions)
      .withFaceLandmarks();

    if (!detection) {
      return {
        detected: false,
        pose: 'unknown',
        confidence: 0
      };
    }

    const landmarks = detection.landmarks;
    
    // วิเคราะห์ท่าใบหน้าจาก landmarks
    const { pose, yaw } = analyzeFacePose(landmarks);
    
    // ตรวจจับการกระพริบตา
    const isBlinking = detectBlinking(landmarks);
    
    // การบันทึกข้อมูลการดีบักสำหรับการตรวจจับท่า
    console.log('การตรวจจับท่าใบหน้า:', {
      pose: pose,
      yaw: yaw.toFixed(2),
      confidence: detection.detection.score.toFixed(3),
      isBlinking,
      timestamp: new Date().toISOString()
    });
    
    return {
      detected: true,
      pose: pose,
      confidence: detection.detection.score,
      landmarks,
      isBlinking
    };

  } catch (error) {
    console.error('ข้อผิดพลาดในการตรวจจับท่าใบหน้า:', error);
    return {
      detected: false,
      pose: 'unknown',
      confidence: 0
    };
  }
}

/**
 * วิเคราะห์ท่าใบหน้าจาก facial landmarks
 * @param landmarks - จุดสำคัญบนใบหน้า 68 จุด
 * @returns ท่าใบหน้าและมุมหมุน
 */
function analyzeFacePose(landmarks: faceApiImport.FaceLandmarks68): {
  pose: 'front' | 'left' | 'right' | 'unknown';
  yaw: number;
} {
  const positions = landmarks.positions;
  
  // ใช้จุด landmarks ของจมูกและมุมตา
  const leftEye = positions[36]; // มุมตาซ้าย
  const rightEye = positions[45]; // มุมตาขวา
  const noseTip = positions[30]; // ปลายจมูก
  
  // คำนวณระยะห่างระหว่างตา
  const eyeDistance = Math.abs(leftEye.x - rightEye.x) || 1;
  
  // คำนวณมุมหมุนหน้า (yaw)
  const faceCenter = (leftEye.x + rightEye.x) / 2;
  const noseOffset = noseTip.x - faceCenter;
  const yaw = (noseOffset / eyeDistance) * 100;
  
  let pose: 'front' | 'left' | 'right' | 'unknown' = 'unknown';
  
  // ปรับเกณฑ์ yaw ให้ยืดหยุ่น ตรวจจับหันหน้าได้ง่ายและเป็นธรรมชาติมากขึ้น (8 องศาขึ้นไป)
  if (Math.abs(yaw) < 8) {
    pose = 'front';
  } else if (yaw >= 8) {
    pose = 'left';
  } else if (yaw <= -8) {
    pose = 'right';
  }
  
  return { pose, yaw };
}

/**
 * ตรวจจับการกระพริบตาด้วย Eye Aspect Ratio (EAR)
 * @param landmarks - จุดสำคัญบนใบหน้า 68 จุด
 * @returns true หากกำลังกระพริบตา
 */
function detectBlinking(landmarks: faceApiImport.FaceLandmarks68): boolean {
  const positions = landmarks.positions;
  
  // จุด landmarks ของตาซ้าย (36-41)
  const leftEyePoints = {
    p1: positions[36], // มุมซ้าย
    p2: positions[37], // บนซ้าย
    p3: positions[38], // บนขวา
    p4: positions[39], // มุมขวา
    p5: positions[40], // ล่างขวา
    p6: positions[41]  // ล่างซ้าย
  };
  
  // จุด landmarks ของตาขวา (42-47)
  const rightEyePoints = {
    p1: positions[42], // มุมซ้าย
    p2: positions[43], // บนซ้าย
    p3: positions[44], // บนขวา
    p4: positions[45], // มุมขวา
    p5: positions[46], // ล่างขวา
    p6: positions[47]  // ล่างซ้าย
  };
  
  // คำนวณ Eye Aspect Ratio (EAR)
  function calculateEAR(eye: { p1: {x: number, y: number}, p2: {x: number, y: number}, p3: {x: number, y: number}, p4: {x: number, y: number}, p5: {x: number, y: number}, p6: {x: number, y: number} }) {
    // ระยะทางแนวตั้ง
    const vertical1 = Math.sqrt(
      Math.pow(eye.p2.x - eye.p6.x, 2) + Math.pow(eye.p2.y - eye.p6.y, 2)
    );
    const vertical2 = Math.sqrt(
      Math.pow(eye.p3.x - eye.p5.x, 2) + Math.pow(eye.p3.y - eye.p5.y, 2)
    );
    
    // ระยะทางแนวนอน
    const horizontal = Math.sqrt(
      Math.pow(eye.p1.x - eye.p4.x, 2) + Math.pow(eye.p1.y - eye.p4.y, 2)
    );
    
    // EAR = (แนวตั้ง1 + แนวตั้ง2) / (2 * แนวนอน)
    return (vertical1 + vertical2) / (2 * horizontal);
  }
  
  const leftEAR = calculateEAR(leftEyePoints);
  const rightEAR = calculateEAR(rightEyePoints);
  const avgEAR = (leftEAR + rightEAR) / 2;
  
  // เกณฑ์สำหรับการกระพริบ (ปรับเป็น 0.30 เพื่อจับการกระพริบตาปกติได้ง่ายและไม่ต้องกะพริบตาแรงเกินไป)
  const blinkThreshold = 0.30;
  
  console.log('การตรวจจับการกระพริบ:', {
    leftEAR: leftEAR.toFixed(3),
    rightEAR: rightEAR.toFixed(3),
    avgEAR: avgEAR.toFixed(3),
    threshold: blinkThreshold,
    isBlinking: avgEAR < blinkThreshold
  });
  
  return avgEAR < blinkThreshold;
}

/**
 * ตรวจสอบภาวะไม่มีส่วนร่วม (Disengagement) ตามเกณฑ์ CBMI
 * ต้องเข้าเงื่อนไข EAR < 0.10 และ headPitch > 10 องศาพร้อมกันเท่านั้น
 */
export function checkEyeDisengagement(
  landmarks: faceApiImport.FaceLandmarks68,
  headPitch: number
): { isDisengaged: boolean; avgEAR: number; leftEAR: number; rightEAR: number } {
  const positions = landmarks.positions;
  const leftEyePoints = {
    p1: positions[36],
    p2: positions[37],
    p3: positions[38],
    p4: positions[39],
    p5: positions[40],
    p6: positions[41]
  };
  const rightEyePoints = {
    p1: positions[42],
    p2: positions[43],
    p3: positions[44],
    p4: positions[45],
    p5: positions[46],
    p6: positions[47]
  };

  const calculateEARInternal = (eye: typeof leftEyePoints) => {
    const v1 = Math.sqrt(Math.pow(eye.p2.x - eye.p6.x, 2) + Math.pow(eye.p2.y - eye.p6.y, 2));
    const v2 = Math.sqrt(Math.pow(eye.p3.x - eye.p5.x, 2) + Math.pow(eye.p3.y - eye.p5.y, 2));
    const h = Math.sqrt(Math.pow(eye.p1.x - eye.p4.x, 2) + Math.pow(eye.p1.y - eye.p4.y, 2)) || 1;
    return (v1 + v2) / (2 * h);
  };

  const leftEAR = calculateEARInternal(leftEyePoints);
  const rightEAR = calculateEARInternal(rightEyePoints);
  const avgEAR = (leftEAR + rightEAR) / 2;

  // CBMI Guide: Flag disengagement ONLY if EAR < 0.10 AND headPitch > 10 simultaneously
  const isDisengaged = avgEAR < EAR_THRESHOLD && headPitch > HEAD_PITCH_DISENGAGEMENT_THRESHOLD;

  return {
    isDisengaged,
    avgEAR: Number(avgEAR.toFixed(3)),
    leftEAR: Number(leftEAR.toFixed(3)),
    rightEAR: Number(rightEAR.toFixed(3))
  };
}

/**
 * ตรวจสอบสถานะการโหลดโมเดล
 * @returns true หากโมเดลโหลดแล้ว
 */
export function isModelsLoaded(): boolean {
  return isModelLoaded;
}

/**
 * รีเซ็ตสถานะการโหลดโมเดล (สำหรับ development)
 */
export function resetModelState(): void {
  isModelLoaded = false;
  isLoading = false;
}