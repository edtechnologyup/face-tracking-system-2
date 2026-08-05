'use client'
import { FaceTrackingData } from '@/lib/mediapipe-detector'

interface DetectionStatsProps {
  data: FaceTrackingData | null
  isActive: boolean
  isMismatchDetected?: boolean
}

export function DetectionStats({ data, isActive, isMismatchDetected }: DetectionStatsProps) {
  if (!isActive || !data) return null

  // กำหนดสถานะปัจจุบันแบบรวม (Primary Status) เพื่อแสดงผลให้ผู้ใช้ทราบอย่างชัดเจน
  const getPrimaryStatus = () => {
    if (isMismatchDetected) {
      return {
        label: '🚨 ตรวจพบใบหน้าอื่น (เสี่ยงการสวมสิทธิ์สอบ)',
        subtext: 'ใบหน้าในกล้องไม่ตรงกับผู้เข้าสอบที่ลงทะเบียนไว้',
        bgColor: 'bg-red-500 text-white border-red-600',
        badgeColor: 'bg-red-700 text-white'
      }
    }
    if (!data.isDetected) {
      return {
        label: '❌ ไม่พบใบหน้าในกล้อง (Loss of Face)',
        subtext: 'กรุณาจัดตำแหน่งใบหน้าให้อยู่ในกรอบกล้องตลอดเวลา',
        bgColor: 'bg-red-100 text-red-900 border-red-300',
        badgeColor: 'bg-red-600 text-white'
      }
    }
    if (data.multipleFaces && data.multipleFaces.isSecurityRisk) {
      return {
        label: `🚨 ตรวจพบหลายใบหน้าในกล้อง (${data.multipleFaces.count} คน)`,
        subtext: 'พบบุคคลอื่นปรากฏในเฟรมกล้อง',
        bgColor: 'bg-red-100 text-red-900 border-red-300',
        badgeColor: 'bg-red-600 text-white'
      }
    }
    if (data.orientation.direction === 'LEFT') {
      return {
        label: '👈 กำลังหันหน้าไปทางซ้าย (Left Turn)',
        subtext: `ตรวจพบการหันหน้าไปทางซ้าย (Yaw: ${data.orientation.yaw.toFixed(1)}°)`,
        bgColor: 'bg-orange-100 text-orange-900 border-orange-300',
        badgeColor: 'bg-orange-600 text-white'
      }
    }
    if (data.orientation.direction === 'RIGHT') {
      return {
        label: '👉 กำลังหันหน้าไปทางขวา (Right Turn)',
        subtext: `ตรวจพบการหันหน้าไปทางขวา (Yaw: ${data.orientation.yaw.toFixed(1)}°)`,
        bgColor: 'bg-orange-100 text-orange-900 border-orange-300',
        badgeColor: 'bg-orange-600 text-white'
      }
    }
    if (data.orientation.direction === 'DOWN') {
      return {
        label: '👇 กำลังก้มหน้า (Look Down)',
        subtext: `ตรวจพบการก้มหน้า (Pitch: ${data.orientation.pitch.toFixed(1)}°)`,
        bgColor: 'bg-purple-100 text-purple-900 border-purple-300',
        badgeColor: 'bg-purple-600 text-white'
      }
    }
    if (data.orientation.direction === 'UP') {
      return {
        label: '👆 กำลังเงยหน้า (Look Up)',
        subtext: `ตรวจพบการเงยหน้า (Pitch: ${data.orientation.pitch.toFixed(1)}°)`,
        bgColor: 'bg-purple-100 text-purple-900 border-purple-300',
        badgeColor: 'bg-purple-600 text-white'
      }
    }

    return {
      label: '🟢 มองตรงเข้ากล้อง (Center - ปกติ)',
      subtext: 'ตรวจพบผู้เข้าสอบในตำแหน่งปกติ',
      bgColor: 'bg-green-100 text-green-900 border-green-300',
      badgeColor: 'bg-green-600 text-white'
    }
  }

  const primaryStatus = getPrimaryStatus()

  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4 mb-4">
      {/* Banner แสดงสถานะการตรวจจับปัจจุบันแบบเรียลไทม์ */}
      <div className={`p-4 rounded-lg border-2 flex items-center justify-between transition-all ${primaryStatus.bgColor}`}>
        <div>
          <div className="text-base font-bold flex items-center gap-2">
            <span>{primaryStatus.label}</span>
          </div>
          <p className="text-xs opacity-90 mt-0.5">{primaryStatus.subtext}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${primaryStatus.badgeColor}`}>
          LIVE STATUS
        </span>
      </div>

      {/* Grid รายละเอียดตัวเลขการตรวจจับ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="text-xs text-gray-500">การตรวจจับใบหน้า</div>
          <div className={`font-semibold mt-1 ${data.isDetected ? 'text-green-600' : 'text-red-600'}`}>
            {data.isDetected ? '✓ ตรวจพบใบหน้า' : '✗ ไม่พบใบหน้า'}
          </div>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="text-xs text-gray-500">ทิศทางใบหน้า</div>
          <div className="font-semibold text-gray-800 mt-1">
            {!data.isDetected ? '-' : data.orientation.direction}
          </div>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="text-xs text-gray-500">มุมซ้าย-ขวา (Yaw)</div>
          <div className="font-semibold text-blue-600 mt-1">
            {!data.isDetected ? '-' : `${data.orientation.yaw.toFixed(1)}°`}
          </div>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="text-xs text-gray-500">มุมก้ม-เงย (Pitch)</div>
          <div className="font-semibold text-purple-600 mt-1">
            {!data.isDetected ? '-' : `${data.orientation.pitch.toFixed(1)}°`}
          </div>
        </div>
      </div>

      {/* Distance & Multiple Faces status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className={`p-2.5 rounded-lg border text-xs flex justify-between items-center ${
          data.multipleFaces?.isSecurityRisk ? 'bg-red-50 text-red-800 border-red-200' : 'bg-gray-50 text-gray-700 border-gray-200'
        }`}>
          <span>จำนวนใบหน้าในกล้อง:</span>
          <span className="font-bold">{data.multipleFaces?.count || (data.isDetected ? 1 : 0)} คน</span>
        </div>

        <div className={`p-2.5 rounded-lg border text-xs flex justify-between items-center ${
          data.distance?.isTooFar ? 'bg-orange-50 text-orange-800 border-orange-200' : 'bg-gray-50 text-gray-700 border-gray-200'
        }`}>
          <span>ระยะห่างกะประมาณ:</span>
          <span className="font-bold">{data.distance?.estimatedCm || 0} cm</span>
        </div>
      </div>
    </div>
  )
}