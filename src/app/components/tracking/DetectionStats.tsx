'use client'
import { FaceTrackingData, OrientationStats } from '@/lib/mediapipe-detector'

interface DetectionStatsProps {
  data: FaceTrackingData | null
  isActive: boolean
  orientationStats?: OrientationStats | null
  faceLossStats?: { lossCount: number; totalLossTime: number } | null
}

export function DetectionStats({ data, isActive }: DetectionStatsProps) {
  if (!isActive || !data) return null

  // กำหนดสถานะปัจจุบันแบบรวม (Primary Status) เพื่อแสดงผลให้ผู้ใช้ทราบอย่างชัดเจน
  const getPrimaryStatus = () => {
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
    <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm space-y-3 sm:space-y-4 mb-4">
      {/* Banner แสดงสถานะการตรวจจับปัจจุบันแบบเรียลไทม์ */}
      <div className={`p-3 sm:p-4 rounded-lg border-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 transition-all ${primaryStatus.bgColor}`}>
        <div className="min-w-0">
          <div className="text-sm sm:text-base font-bold">
            <span className="break-words">{primaryStatus.label}</span>
          </div>
          <p className="text-xs opacity-90 mt-0.5 break-words">{primaryStatus.subtext}</p>
        </div>
        <span className={`self-start shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${primaryStatus.badgeColor}`}>
          LIVE STATUS
        </span>
      </div>



      {/* Grid รายละเอียดตัวเลขการตรวจจับ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className={`p-3 rounded-lg border flex flex-col justify-center ${
          data.multipleFaces?.isSecurityRisk 
            ? 'bg-red-50 border-red-300 text-red-900' 
            : data.isDetected ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
        }`}>
          <div className="text-xs text-gray-500 font-medium">จำนวนใบหน้าที่ตรวจพบ</div>
          <div className="text-base font-extrabold mt-0.5 flex items-center gap-1.5">
            <span>👤</span>
            <span>{data.multipleFaces?.count || (data.isDetected ? 1 : 0)} คน</span>
            {data.multipleFaces?.isSecurityRisk && (
              <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold ml-1 animate-pulse">
                เสี่ยงทุจริต!
              </span>
            )}
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
        <div className={`p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 ${
          data.multipleFaces?.isSecurityRisk ? 'bg-red-50 text-red-800 border-red-200' : 'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          <span>สถานะจำนวนใบหน้าในกล้อง:</span>
          <span className="font-bold break-words">
            {data.multipleFaces?.isSecurityRisk ? `🚨 พบ ${data.multipleFaces.count} ใบหน้า (เสี่ยงทุจริต)` : `🟢 ปกติ (${data.isDetected ? 1 : 0} ใบหน้า)`}
          </span>
        </div>

        <div className={`p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 ${
          data.distance?.isTooFar ? 'bg-orange-50 text-orange-800 border-orange-200' : 'bg-gray-50 text-gray-700 border-gray-200'
        }`}>
          <span>ระยะห่างกะประมาณ:</span>
          <span className="font-bold">{data.distance?.estimatedCm || 0} cm</span>
        </div>
      </div>
    </div>
  )
}