import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'
import { FACE_AUTH_DISABLED_MESSAGE, isFaceAuthEnabled } from '@/lib/face-auth-flag'

// ฟังก์ชันคำนวณ Euclidean distance (server-side)
function euclideanDistance(arr1: number[], arr2: number[]): number {
  if (arr1.length !== arr2.length) {
    throw new Error('Arrays must have the same length');
  }
  
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    sum += Math.pow(arr1[i] - arr2[i], 2);
  }
  
  return Math.sqrt(sum);
}

// ฟังก์ชัน extract userId จาก token (รองรับหลาย purpose)
function extractUserIdFromToken(
  request: NextRequest, 
  secret: string, 
  allowedPurposes: string[]
): { userId: string | null; error: NextResponse | null } {
  const authorization = request.headers.get('authorization')
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return { 
      userId: null, 
      error: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 }) 
    }
  }

  const token = authorization.substring(7)
  try {
    const decoded = jwt.verify(token, secret) as { userId: string; purpose?: string }
    
    // ตรวจสอบ purpose ของ token
    const tokenPurpose = decoded.purpose || 'login'
    if (!allowedPurposes.includes(tokenPurpose)) {
      return { 
        userId: null, 
        error: NextResponse.json({ error: 'Token ไม่ถูกต้องสำหรับการดำเนินการนี้' }, { status: 403 }) 
      }
    }

    return { userId: decoded.userId, error: null }
  } catch {
    return { 
      userId: null, 
      error: NextResponse.json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' }, { status: 401 }) 
    }
  }
}

export async function POST(request: NextRequest) {
  if (!isFaceAuthEnabled()) {
    return NextResponse.json(
      { error: FACE_AUTH_DISABLED_MESSAGE, faceAuthEnabled: false },
      { status: 503 }
    )
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured')
    }

    const body = await request.json()
    const { faceData, verifiedPoses, singlePoseVerification, forPasswordReset, verificationToken } = body

    // กำหนด userId จาก source ที่เหมาะสม
    let userId: string | null = null

    if (forPasswordReset && verificationToken) {
      // Flow: forgot-password → face-verify (ใช้ verificationToken แทน JWT)
      try {
        const decoded = jwt.verify(verificationToken, JWT_SECRET) as { userId: string; purpose?: string }
        if (decoded.purpose !== 'face-verification') {
          return NextResponse.json(
            { error: 'Token ยืนยันตัวตนไม่ถูกต้อง' },
            { status: 403 }
          )
        }
        userId = decoded.userId
      } catch {
        return NextResponse.json(
          { error: 'Token ยืนยันตัวตนหมดอายุ กรุณาเริ่มกระบวนการรีเซ็ตรหัสผ่านใหม่' },
          { status: 401 }
        )
      }
    } else {
      // Flow ปกติ: login 2FA, tracking identity check — ใช้ JWT จาก Authorization header
      const result = extractUserIdFromToken(request, JWT_SECRET, ['login', 'face-registration'])
      if (result.error) return result.error
      userId = result.userId
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'ไม่สามารถระบุตัวตนผู้ใช้ได้' },
        { status: 401 }
      )
    }

    // ตรวจสอบข้อมูลที่รับเข้ามา
    if (!faceData) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      )
    }

    // ตรวจสอบรูปแบบข้อมูลใบหน้า (รองรับทั้ง 512D ArcFace และ 128D Legacy)
    if (!Array.isArray(faceData) || (faceData.length !== 512 && faceData.length !== 128)) {
      return NextResponse.json(
        { error: 'ข้อมูลใบหน้าไม่ถูกต้อง (ต้องเป็นขนาด 512D หรือ 128D)' },
        { status: 400 }
      )
    }

    // ดึงข้อมูลใบหน้าที่บันทึกไว้
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, faceData: true, firstName: true, lastName: true, email: true }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลผู้ใช้' },
        { status: 400 }
      )
    }

    if (!user.faceData) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลใบหน้าที่ลงทะเบียน กรุณาลงทะเบียนใบหน้าก่อน' },
        { status: 400 }
      )
    }

    // เปรียบเทียบข้อมูลลักษณะใบหน้า
    let storedFaceData: Record<string, number[]> | number[]
    
    if (typeof user.faceData === 'string') {
      storedFaceData = JSON.parse(user.faceData)
    } else {
      storedFaceData = user.faceData
    }

    const is512D = faceData.length === 512
    const distances: { pose: string, distance: number, similarity?: number }[] = []
    let minDistance = Infinity
    let maxSimilarity = 0
    let bestMatch = ''

    const calculateCosineSimilarity = (v1: number[], v2: number[]) => {
      let dot = 0, n1 = 0, n2 = 0
      for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i]
        n1 += v1[i] * v1[i]
        n2 += v2[i] * v2[i]
      }
      return dot / ((Math.sqrt(n1) * Math.sqrt(n2)) || 1)
    }

    if (Array.isArray(storedFaceData)) {
      if (is512D && storedFaceData.length === 512) {
        const sim = calculateCosineSimilarity(faceData, storedFaceData)
        distances.push({ pose: 'legacy_512', distance: 1 - sim, similarity: sim })
        maxSimilarity = sim
        bestMatch = 'legacy_512'
      } else {
        const distance = euclideanDistance(faceData, storedFaceData)
        distances.push({ pose: 'legacy', distance })
        minDistance = distance
        bestMatch = 'legacy'
      }
    } else {
      const poses = Object.keys(storedFaceData)
      for (const pose of poses) {
        const storedVec = (storedFaceData as Record<string, number[]>)[pose]
        if (Array.isArray(storedVec)) {
          if (is512D && storedVec.length === 512) {
            const sim = calculateCosineSimilarity(faceData, storedVec)
            distances.push({ pose, distance: 1 - sim, similarity: sim })
            if (sim > maxSimilarity) {
              maxSimilarity = sim
              bestMatch = pose
            }
          } else if (storedVec.length === 128) {
            const distance = euclideanDistance(faceData, storedVec)
            distances.push({ pose, distance })
            if (distance < minDistance) {
              minDistance = distance
              bestMatch = pose
            }
          }
        }
      }
    }

    // เกณฑ์การจับคู่ใบหน้า: 512D ArcFace Cosine Similarity >= 0.65 vs 128D Euclidean Distance < 0.50
    const arcFaceThreshold = 0.65
    const legacyThreshold = singlePoseVerification ? 0.50 : 0.45
    const threshold = is512D ? arcFaceThreshold : legacyThreshold

    const validMatches = is512D
      ? distances.filter(d => (d.similarity || 0) >= arcFaceThreshold)
      : distances.filter(d => d.distance < legacyThreshold)
    
    // ตรวจสอบการยืนยันท่า (ถ้ามีข้อมูล verifiedPoses)
    let poseVerificationPassed = true
    if (verifiedPoses) {
      if (singlePoseVerification) {
        // การยืนยันท่าเดียว - เฉพาะท่าใดท่าหนึ่ง
        const requiredPoses = ['front', 'left', 'right']
        const verifiedPoseTypes = Object.keys(verifiedPoses).filter(pose => verifiedPoses[pose])
        poseVerificationPassed = verifiedPoseTypes.length >= 1 && 
                                 verifiedPoseTypes.some(pose => requiredPoses.includes(pose))
      } else {
        // การยืนยันหลายท่า - ต้องครบ 3 ท่า
        const requiredPoses = ['front', 'left', 'right']
        const verifiedCount = requiredPoses.filter(pose => verifiedPoses[pose]).length
        poseVerificationPassed = verifiedCount >= 3
      }
    }
    
    const isMatch = is512D
      ? (maxSimilarity >= arcFaceThreshold && validMatches.length > 0 && poseVerificationPassed)
      : (minDistance < threshold && validMatches.length > 0 && poseVerificationPassed)

    let resetToken: string | undefined = undefined
    if (isMatch && forPasswordReset) {
      resetToken = jwt.sign(
        { 
          userId: user.id, 
          email: user.email, 
          purpose: 'password-reset' 
        },
        JWT_SECRET,
        { expiresIn: '15m' }
      )
    }

    return NextResponse.json({
      isMatch,
      distance: minDistance,
      bestMatch,
      allDistances: distances,
      threshold,
      resetToken,
      message: isMatch 
        ? `ยืนยันตัวตนสำเร็จ (ตรงกับท่า ${bestMatch}${verifiedPoses ? (singlePoseVerification ? ' + ยืนยันท่าเดียว' : ' + ยืนยัน 3 ท่าครบถ้วน') : ''})` 
        : !poseVerificationPassed 
          ? (singlePoseVerification ? 'การยืนยันท่าไม่สำเร็จ กรุณาทำท่าที่ระบบร้องขอให้ถูกต้อง' : 'การยืนยัน 3 ท่าไม่ครบถ้วน กรุณาทำการยืนยันท่าให้ครบทั้ง 3 ท่า')
          : `ใบหน้าไม่ตรงกับข้อมูลที่ลงทะเบียน`
    })

  } catch (error: unknown) {
    console.error('Face verification error:', error instanceof Error ? error.message : 'Unknown error')
    
    return NextResponse.json(
      { 
        error: 'เกิดข้อผิดพลาดในการตรวจสอบใบหน้า',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : undefined
      },
      { status: 500 }
    )
  }
}