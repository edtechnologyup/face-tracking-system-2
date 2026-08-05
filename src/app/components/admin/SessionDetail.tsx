'use client'

import { Card } from '@/app/components/ui/Card'
import { Button } from '@/app/components/ui/Button'
import { formatThaiDateTime } from '@/lib/utils/datetime'

interface TrackingLog {
  id: string
  sessionId: string
  detectionType: string
  detectionData?: Record<string, unknown>
  confidence: number | null
  timestamp: string
}

interface SessionDetail {
  session: {
    id: string
    sessionName: string | null
    startTime: string
    endTime: string | null
    totalDuration: number | null
    status?: string | null
    user: {
      firstName: string
      lastName: string
      email: string
      studentId?: string | null
      section?: string | null
    }
  }
  logs: TrackingLog[]
  stats: {
    totalLogs: number
    faceOrientationCount: number
    faceDetectionLossCount: number
    directionCounts: {
      UP: number
      DOWN: number
      LEFT: number
      RIGHT: number
      FORWARD: number
    }
    directionDurations: {
      UP: number
      DOWN: number
      LEFT: number
      RIGHT: number
      FORWARD: number
    }
    totalBehaviorDuration: number
    averageConfidence: number
  }
}

interface SessionDetailProps {
  sessionDetail: SessionDetail
  loading: boolean
  onBackClick: () => void
}

export function SessionDetail({ sessionDetail, loading, onBackClick }: SessionDetailProps) {
  const formatDate = (dateInput: string | Date) => {
    try {
      let date: Date
      
      if (typeof dateInput === 'string') {
        date = new Date(dateInput)
      } else if (dateInput instanceof Date) {
        date = dateInput
      } else {
        return String(dateInput)
      }
      
      if (isNaN(date.getTime())) {
        return String(dateInput)
      }
      
      return formatThaiDateTime(date).replace(' ', ', ')
    } catch (error) {
      console.error('Date formatting error:', error, 'Input:', dateInput)
      return String(dateInput)
    }
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getDetectionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'FACE_ORIENTATION': 'การเปลี่ยนทิศทางใบหน้า',
      'FACE_DETECTION_LOSS': 'การสูญเสียการตรวจจับใบหน้า'
    }
    return labels[type] || type
  }

  const getDetectionTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'FACE_ORIENTATION': 'bg-blue-100 text-blue-800',
      'FACE_DETECTION_LOSS': 'bg-red-100 text-red-800'
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  const getDirectionLabel = (direction: string) => {
    const labels: Record<string, string> = {
      'UP': 'เงยหน้า',
      'DOWN': 'ก้มหน้า', 
      'LEFT': 'หันซ้าย',
      'RIGHT': 'หันขวา',
      'FORWARD': 'มองหน้าตรง'
    }
    return labels[direction] || direction
  }

  const getDirectionColor = (direction: string) => {
    const colors: Record<string, string> = {
      'UP': 'bg-purple-100 text-purple-800',
      'DOWN': 'bg-yellow-100 text-yellow-800',
      'LEFT': 'bg-orange-100 text-orange-800', 
      'RIGHT': 'bg-green-100 text-green-800',
      'FORWARD': 'bg-blue-100 text-blue-800'
    }
    return colors[direction] || 'bg-gray-100 text-gray-800'
  }

  const getCalculatedDuration = (data?: Record<string, unknown>): number => {
    if (!data) return 0
    if (typeof data.duration === 'number' && data.duration > 0) {
      return data.duration
    }
    const startTimeStr = data.startTime as string
    const endTimeStr = data.endTime as string
    if (startTimeStr && endTimeStr) {
      const [sH, sM, sS] = startTimeStr.split(':').map(Number)
      const [eH, eM, eS] = endTimeStr.split(':').map(Number)
      if (!isNaN(sH) && !isNaN(eH)) {
        const startMs = (sH * 3600 + sM * 60 + sS) * 1000
        const endMs = (eH * 3600 + eM * 60 + eS) * 1000
        return Math.max(0, (endMs - startMs) / 1000)
      }
    }
    return typeof data.duration === 'number' ? data.duration : 0
  }

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
      </Card>
    )
  }

  if (!sessionDetail) {
    return (
      <Card className="p-8 text-center">
        <p className="text-gray-600">ไม่สามารถโหลดข้อมูลได้</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center space-x-4">
        <Button
          onClick={onBackClick}
          className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>กลับไปรายการเซสชัน</span>
        </Button>
      </div>

      {/* Session Info Card */}
      <Card className="p-3.5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">ข้อมูลเซสชัน</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <p className="text-sm text-gray-600">ผู้ใช้</p>
            <p className="font-medium">
              {sessionDetail.session.user.firstName} {sessionDetail.session.user.lastName}
            </p>
            {sessionDetail.session.user.studentId && (
              <p className="text-sm text-gray-500">รหัส: {sessionDetail.session.user.studentId}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-600">กลุ่มเรียน (Section)</p>
            <p className="font-medium text-purple-700">
              {sessionDetail.session.user.section || 'ไม่มีกลุ่มเรียน'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">สถานะ</p>
            <p className={`font-medium ${
              sessionDetail.session.status === 'DISCONNECTED' ? 'text-red-600 font-semibold' :
              sessionDetail.session.endTime ? 'text-gray-900' : 'text-green-600 animate-pulse'
            }`}>
              {sessionDetail.session.status === 'DISCONNECTED' ? 'ขาดการเชื่อมต่อระหว่างตรวจจับ' :
               sessionDetail.session.endTime ? 'เสร็จสิ้น' : 'กำลังดำเนินการ'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">เริ่มต้น</p>
            <p className="font-medium">{formatDate(sessionDetail.session.startTime)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">สิ้นสุด</p>
            <p className="font-medium">
              {sessionDetail.session.endTime ? formatDate(sessionDetail.session.endTime) : (sessionDetail.session.status === 'INTERRUPTED' ? 'หยุดกลางคัน' : 'กำลังดำเนินการ')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">ระยะเวลา</p>
            <p className="font-medium">{formatDuration(sessionDetail.session.totalDuration)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">สถานะเซสชัน</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
              sessionDetail.session.status === 'INTERRUPTED' ? 'bg-red-100 text-red-800 border border-red-200' :
              sessionDetail.session.status === 'COMPLETED' || sessionDetail.session.endTime ? 'bg-gray-100 text-gray-800' :
              'bg-green-100 text-green-800 animate-pulse'
            }`}>
              {sessionDetail.session.status === 'INTERRUPTED' ? 'หยุดการบันทึกกลางคัน' :
               sessionDetail.session.status === 'COMPLETED' || sessionDetail.session.endTime ? 'เสร็จสิ้น' :
               'กำลังดำเนินการ'}
            </span>
          </div>
        </div>
      </Card>

      {/* Statistics Card */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">สถิติการตรวจจับ(ครั้ง)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{sessionDetail.stats.totalLogs}</p>
            <p className="text-sm text-gray-600">รวมทั้งหมด</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{sessionDetail.stats.faceOrientationCount}</p>
            <p className="text-sm text-gray-600">การเปลี่ยนทิศทาง</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{sessionDetail.stats.faceDetectionLossCount}</p>
            <p className="text-sm text-gray-600">สูญเสียการตรวจจับ</p>
          </div>
        </div>
        
        {/* Direction Statistics */}
        <h4 className="text-md font-semibold text-gray-900 mb-3">สถิติพฤติกรรม</h4>
        <div className="flex flex-wrap gap-3">
          <div className="text-center p-3 bg-purple-50 rounded-lg flex-1 min-w-[120px]">
            <p className="text-xl font-bold text-purple-600">{sessionDetail.stats.directionCounts.UP}</p>
            <p className="text-xs text-gray-600">เงยหน้า</p>
            <p className="text-xs text-purple-600 font-semibold">{Number(sessionDetail.stats.directionDurations.UP || 0).toFixed(1)}s</p>
          </div>
          <div className="text-center p-3 bg-yellow-50 rounded-lg flex-1 min-w-[120px]">
            <p className="text-xl font-bold text-yellow-600">{sessionDetail.stats.directionCounts.DOWN}</p>
            <p className="text-xs text-gray-600">ก้มหน้า</p>
            <p className="text-xs text-yellow-600 font-semibold">{Number(sessionDetail.stats.directionDurations.DOWN || 0).toFixed(1)}s</p>
          </div>
          <div className="text-center p-3 bg-orange-50 rounded-lg flex-1 min-w-[120px]">
            <p className="text-xl font-bold text-orange-600">{sessionDetail.stats.directionCounts.LEFT}</p>
            <p className="text-xs text-gray-600">หันซ้าย</p>
            <p className="text-xs text-orange-600 font-semibold">{Number(sessionDetail.stats.directionDurations.LEFT || 0).toFixed(1)}s</p>
          </div>
          <div className="text-center p-3 bg-pink-50 rounded-lg flex-1 min-w-[120px]">
            <p className="text-xl font-bold text-pink-600">{sessionDetail.stats.directionCounts.RIGHT}</p>
            <p className="text-xs text-gray-600">หันขวา</p>
            <p className="text-xs text-pink-600 font-semibold">{Number(sessionDetail.stats.directionDurations.RIGHT || 0).toFixed(1)}s</p>
          </div>
          
          {/* Total Behavior Duration */}
          <div className="text-center p-3 bg-indigo-50 rounded-lg flex-1 min-w-[120px]">
            <p className="text-xl font-bold text-indigo-600">{Number(sessionDetail.stats.totalBehaviorDuration || 0).toFixed(1)}s</p>
            <p className="text-xs text-gray-600">รวมเวลาทั้งหมด</p>
          </div>
        </div>
      </Card>

      {/* Logs Table */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">รายการ Detection Logs</h3>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เวลา</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ประเภทการตรวจจับ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ความมั่นใจ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ทิศทาง/ข้อมูลเพิ่มเติม</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sessionDetail.logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(log.detectionData?.startTime as string) || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      getDetectionTypeColor(log.detectionType)
                    }`}>
                      {getDetectionTypeLabel(log.detectionType)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.confidence ? `${(log.confidence * 100).toFixed(2)}%` : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {log.detectionData && typeof log.detectionData === 'object' ? (
                      <div className="space-y-1">
                        {(log.detectionData.direction as string) && (
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            getDirectionColor(log.detectionData.direction as string)
                          }`}>
                            {getDirectionLabel(log.detectionData.direction as string)}
                          </span>
                        )}
                        <div className="text-xs text-gray-500 mt-1.5 space-y-1 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                          {(log.detectionData.startTime as string) && (log.detectionData.endTime as string) && (
                            <div>⏱️ <b>ช่วงเวลา:</b> {log.detectionData.startTime as string} - {log.detectionData.endTime as string}</div>
                          )}
                          <div>⏳ <b>ระยะเวลา:</b> {getCalculatedDuration(log.detectionData as Record<string, unknown>).toFixed(1)} วินาที</div>
                          {(log.detectionData.maxYaw as number) !== undefined && log.detectionData.maxYaw !== null && (
                            <div>📐 <b>มุมหันซ้าย-ขวา (Yaw):</b> {(log.detectionData.maxYaw as number).toFixed(1)}°</div>
                          )}
                          {(log.detectionData.maxPitch as number) !== undefined && log.detectionData.maxPitch !== null && (
                            <div>📐 <b>มุมก้ม-เงย (Pitch):</b> {(log.detectionData.maxPitch as number).toFixed(1)}°</div>
                          )}
                          {log.confidence && (
                            <div>🎯 <b>ความแม่นยำ AI (Confidence):</b> {(log.confidence * 100).toFixed(1)}%</div>
                          )}
                          {(log.detectionData.distanceCm as number) && (
                            <div>📏 <b>ระยะห่างจากกล้อง:</b> {log.detectionData.distanceCm as number} cm</div>
                          )}
                          {(log.detectionData.facesCount as number) && (
                            <div>👥 <b>จำนวนใบหน้าในกล้อง:</b> {log.detectionData.facesCount as number} คน</div>
                          )}
                        </div>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}