'use client'

import { useState } from 'react'
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
    securityViolationCount?: number
    violationCounts?: {
      MULTI_FACE_DETECTED: number
      LOOKING_AWAY_EXCEEDED: number
      FACE_LOSS: number
      CRITICAL: number
      WARNING: number
    }
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
  const [logFilter, setLogFilter] = useState<'ALL' | 'ORIENTATION' | 'LOSS' | 'VIOLATION'>('ALL')

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
      'FACE_DETECTION_LOSS': 'การสูญเสียการตรวจจับใบหน้า',
      'SECURITY_VIOLATION': '🚨 เหตุการณ์ผิดปกติทางการสอบ'
    }
    return labels[type] || type
  }

  const getDetectionTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'FACE_ORIENTATION': 'bg-blue-100 text-blue-800',
      'FACE_DETECTION_LOSS': 'bg-amber-100 text-amber-800 border border-amber-200',
      'SECURITY_VIOLATION': 'bg-red-100 text-red-800 border border-red-200 font-semibold'
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  const getViolationTypeLabel = (vType?: string) => {
    switch (vType) {
      case 'MULTI_FACE_DETECTED':
        return '👥 ตรวจพบหลายใบหน้าในกล้อง'
      case 'LOOKING_AWAY_EXCEEDED':
        return '👁️ มองออกนอกจอนานเกินกำหนด'
      case 'FACE_LOSS':
        return '❌ ไม่พบใบหน้าในกล้อง'
      case 'FACE_MISMATCH':
        return '👤 ใบหน้าไม่ตรงกับผู้สมัคร'
      default:
        return vType || 'เหตุการณ์ผิดปกติ'
    }
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

  const securityViolationCount = sessionDetail.stats.securityViolationCount || 
    sessionDetail.logs.filter(l => l.detectionType === 'SECURITY_VIOLATION').length

  const filteredLogs = sessionDetail.logs.filter(log => {
    if (logFilter === 'ORIENTATION') return log.detectionType === 'FACE_ORIENTATION'
    if (logFilter === 'LOSS') return log.detectionType === 'FACE_DETECTION_LOSS'
    if (logFilter === 'VIOLATION') return log.detectionType === 'SECURITY_VIOLATION'
    return true
  })

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{sessionDetail.stats.totalLogs}</p>
            <p className="text-sm text-gray-600">รวมทั้งหมด</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{sessionDetail.stats.faceOrientationCount}</p>
            <p className="text-sm text-gray-600">การเปลี่ยนทิศทาง</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <p className="text-2xl font-bold text-amber-600">{sessionDetail.stats.faceDetectionLossCount}</p>
            <p className="text-sm text-gray-600">สูญเสียการตรวจจับ</p>
          </div>
          <div className="text-center p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{securityViolationCount}</p>
            <p className="text-sm font-medium text-red-700">🚨 เหตุการณ์ผิดปกติ (Violations)</p>
          </div>
        </div>
        
        {/* Security Violations Banner if any */}
        {securityViolationCount > 0 && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">🚨</span>
                <div>
                  <h4 className="text-md font-bold text-red-800">
                    ตรวจพบเหตุการณ์ผิดปกติทางการสอบทั้งหมด {securityViolationCount} รายการ!
                  </h4>
                  <p className="text-xs text-red-600">
                    {sessionDetail.stats.violationCounts?.MULTI_FACE_DETECTED ? `• พบหลายใบหน้า ${sessionDetail.stats.violationCounts.MULTI_FACE_DETECTED} ครั้ง ` : ''}
                    {sessionDetail.stats.violationCounts?.LOOKING_AWAY_EXCEEDED ? `• มองนอกจอนานเกิน ${sessionDetail.stats.violationCounts.LOOKING_AWAY_EXCEEDED} ครั้ง ` : ''}
                    {sessionDetail.stats.violationCounts?.CRITICAL ? `• ระดับอันตรายสูง (Critical) ${sessionDetail.stats.violationCounts.CRITICAL} รายการ` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLogFilter('VIOLATION')}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
              >
                ดูเฉพาะเหตุการณ์ผิดปกติ
              </button>
            </div>
          </div>
        )}

        {/* Direction Statistics */}
        <h4 className="text-md font-semibold text-gray-900 mb-3">สถิติพฤติกรรมการหันหน้า</h4>
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

      {/* Logs Table with Filter Tabs */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
          <h3 className="text-lg font-semibold text-gray-900">รายการ Detection Logs</h3>
          
          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg text-xs">
            <button
              onClick={() => setLogFilter('ALL')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                logFilter === 'ALL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ทั้งหมด ({sessionDetail.logs.length})
            </button>
            <button
              onClick={() => setLogFilter('ORIENTATION')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                logFilter === 'ORIENTATION' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              การเปลี่ยนทิศทาง ({sessionDetail.stats.faceOrientationCount})
            </button>
            <button
              onClick={() => setLogFilter('LOSS')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                logFilter === 'LOSS' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              สูญเสียการตรวจจับ ({sessionDetail.stats.faceDetectionLossCount})
            </button>
            <button
              onClick={() => setLogFilter('VIOLATION')}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center space-x-1 ${
                logFilter === 'VIOLATION' ? 'bg-red-600 text-white shadow-sm' : 'text-red-600 hover:text-red-800'
              }`}
            >
              <span>🚨 เหตุการณ์ผิดปกติ</span>
              <span className="bg-red-200 text-red-900 font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                {securityViolationCount}
              </span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เวลา</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ประเภทการตรวจจับ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ความมั่นใจ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รายละเอียด / เหตุการณ์</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                    ไม่พบรายการล็อกที่ตรงตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isViolation = log.detectionType === 'SECURITY_VIOLATION'
                  const severity = log.detectionData?.severity as string
                  const violationType = log.detectionData?.violationType as string

                  return (
                    <tr key={log.id} className={`hover:bg-gray-50 ${isViolation ? 'bg-red-50/40' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {(log.detectionData?.startTime as string) || (log.detectionData?.timestamp as string) ? (
                          new Date(log.detectionData?.timestamp as string || Date.now()).toLocaleTimeString('th-TH')
                        ) : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          getDetectionTypeColor(log.detectionType)
                        }`}>
                          {getDetectionTypeLabel(log.detectionType)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.confidence ? `${(log.confidence * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {isViolation ? (
                          <div className="space-y-1.5 bg-white p-3 rounded-lg border border-red-200 shadow-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-red-900 text-xs flex items-center space-x-1.5">
                                <span>{getViolationTypeLabel(violationType)}</span>
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                severity === 'CRITICAL' ? 'bg-red-600 text-white animate-pulse' : 'bg-amber-500 text-white'
                              }`}>
                                {severity || 'VIOLATION'}
                              </span>
                            </div>
                            {typeof log.detectionData?.message === 'string' && (
                              <p className="text-xs text-red-700 font-medium">{log.detectionData.message as string}</p>
                            )}
                            <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-red-100">
                              {log.detectionData?.faceCount !== undefined && (
                                <span><b>จำนวนใบหน้า:</b> {String(log.detectionData.faceCount)} คน</span>
                              )}
                              {log.detectionData?.duration !== undefined && (
                                <span><b>ระยะเวลา:</b> {Number(log.detectionData.duration).toFixed(1)} วินาที</span>
                              )}
                              {typeof log.detectionData?.timestamp === 'string' && (
                                <span><b>เวลาเกิดเหตุ:</b> {new Date(log.detectionData.timestamp as string).toLocaleTimeString('th-TH')}</span>
                              )}
                            </div>
                          </div>
                        ) : log.detectionData && typeof log.detectionData === 'object' ? (
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
                                <div><b>ช่วงเวลา:</b> {log.detectionData.startTime as string} - {log.detectionData.endTime as string}</div>
                              )}
                              <div><b>ระยะเวลา:</b> {getCalculatedDuration(log.detectionData as Record<string, unknown>).toFixed(1)} วินาที</div>
                              {(log.detectionData.maxYaw as number) !== undefined && log.detectionData.maxYaw !== null && (
                                <div><b>มุมหันซ้าย-ขวา (Yaw):</b> {(log.detectionData.maxYaw as number).toFixed(1)}°</div>
                              )}
                              {(log.detectionData.maxPitch as number) !== undefined && log.detectionData.maxPitch !== null && (
                                <div><b>มุมก้ม-เงย (Pitch):</b> {(log.detectionData.maxPitch as number).toFixed(1)}°</div>
                              )}
                              {log.confidence && (
                                <div><b>ความแม่นยำ AI (Confidence):</b> {(log.confidence * 100).toFixed(1)}%</div>
                              )}
                              {(log.detectionData.distanceCm as number) && (
                                <div><b>ระยะห่างจากกล้อง:</b> {log.detectionData.distanceCm as number} cm</div>
                              )}
                              {(log.detectionData.facesCount as number) && (
                                <div><b>จำนวนใบหน้าในกล้อง:</b> {log.detectionData.facesCount as number} คน</div>
                              )}
                            </div>
                          </div>
                        ) : '-'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}