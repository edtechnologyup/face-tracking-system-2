'use client'
import { FaceTrackingData } from '@/lib/mediapipe-detector'

interface DetectionStatsProps {
  data: FaceTrackingData | null
  isActive: boolean
}

export function DetectionStats({ data, isActive }: DetectionStatsProps) {
  // ฟังก์ชันกำหนดทิศทางการหันตามทิศทางที่ได้จาก detector
  const getOrientationIndicator = (direction?: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'CENTER') => {
    switch (direction) {
      case 'LEFT':
        return { direction: '← หันซ้าย', color: 'bg-orange-100 text-orange-800' }
      case 'RIGHT':
        return { direction: 'หันขวา →', color: 'bg-orange-100 text-orange-800' }
      case 'UP':
        return { direction: '↑ เงยหน้า', color: 'bg-purple-100 text-purple-800' }
      case 'DOWN':
        return { direction: 'ก้มหน้า ↓', color: 'bg-purple-100 text-purple-800' }
      case 'CENTER':
      default:
        return { direction: 'มองตรง ●', color: 'bg-green-100 text-green-800' }
    }
  }

  if (!isActive || !data) return null

  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <h3 className="font-semibold mb-2">สถานะปัจจุบัน:</h3>
      
      {/* Face Detection & Overall Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
        <div className={`p-2 rounded ${data.isDetected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          Face Detection: {data.isDetected ? 'ตรวจพบใบหน้า' : 'ไม่พบใบหน้า'}
        </div>
        <div className={`p-2 rounded ${!data.isDetected ? 'bg-gray-100 text-gray-800' : data.orientation.isLookingAway ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          Orientation: {!data.isDetected ? 'ไม่พบใบหน้า' : data.orientation.isLookingAway ? 'หันหน้าออก' : 'อยู่ในเฟรมตรวจจับ'}
        </div>
      </div>

      {/* Security Alert for Multiple Faces */}
      {data.multipleFaces && data.multipleFaces.isSecurityRisk && (
        <div className="mb-3 p-3 rounded bg-red-100 border border-red-300">
          <div className="flex items-center">
            <span className="text-red-600 font-bold mr-2">🚨</span>
            <span className="text-red-800 font-semibold">เตือนความปลอดภัย</span>
          </div>
          <div className="text-red-700 text-sm mt-1">
            ตรวจพบ {data.multipleFaces.count} ใบหน้า - อาจมีคนอื่นในการสอบ
          </div>
        </div>
      )}

      {/* Orientation Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-3">
        <div className="p-2 rounded bg-blue-100 text-blue-800">
          Yaw: {!data.isDetected ? 'ไม่พบใบหน้า' : `${data.orientation.yaw.toFixed(1)}°`}
        </div>
        <div className="p-2 rounded bg-blue-100 text-blue-800">
          Pitch: {!data.isDetected ? 'ไม่พบใบหน้า' : `${data.orientation.pitch.toFixed(1)}°`}
        </div>
        <div className="p-2 rounded bg-gray-100 text-gray-800">
          Landmarks: {data.landmarks?.length || 0} จุด
        </div>
        <div className={`p-2 rounded ${!data.isDetected ? 'bg-gray-100 text-gray-800' : getOrientationIndicator(data.orientation.direction).color}`}>
          ทิศทาง: {!data.isDetected ? 'ไม่พบใบหน้า' : getOrientationIndicator(data.orientation.direction).direction}
        </div>
      </div>

      {/* Distance Alert */}
      {data.distance?.isTooFar && (
        <div className="mb-3 p-3 rounded bg-orange-100 border border-orange-300">
          <div className="flex items-center">
            <span className="text-orange-600 font-bold mr-2">⚠️</span>
            <span className="text-orange-800 font-semibold">เตือนระยะห่าง</span>
          </div>
          <div className="text-orange-700 text-sm mt-1">
            ระยะห่างจากจอมากเกินไป ({data.distance.estimatedCm}cm) - เข้าใกล้ให้ใกล้กว่า 80cm
          </div>
        </div>
      )}

      {/* Face Count and Distance Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
        {data.multipleFaces && (
          <>
            <div className={`p-2 rounded ${data.multipleFaces.isSecurityRisk ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
              จำนวนใบหน้า: {data.multipleFaces.count}
            </div>
            <div className={`p-2 rounded ${data.multipleFaces.isSecurityRisk ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
              สถานะ: {data.multipleFaces.isSecurityRisk ? 'เสี่ยงต่อความปลอดภัย' : 'ปกติ'}
            </div>
          </>
        )}
        <div className={`p-2 rounded ${data.distance?.isTooFar ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
          ระยะห่าง: {data.distance?.estimatedCm || 0}cm
        </div>
      </div>
    </div>
  )
}