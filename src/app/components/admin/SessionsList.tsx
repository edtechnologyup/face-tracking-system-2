'use client'

import { useState } from 'react'
import { Card } from '@/app/components/ui/Card'
import { formatThaiDateTime } from '@/lib/utils/datetime'

interface TrackingSession {
  id: string
  sessionName: string | null
  startTime: string
  endTime: string | null
  totalDuration: number | null
  user: {
    firstName: string
    lastName: string
    email: string
    studentId?: string | null
  }
}

interface SessionsListProps {
  sessions: TrackingSession[]
  onSessionClick: (sessionId: string) => void
  onRefresh?: () => void
}

export function SessionsList({ sessions, onSessionClick, onRefresh }: SessionsListProps) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<TrackingSession | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

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

  const openDeleteModal = (session: TrackingSession) => {
    setSelectedSession(session)
    setIsDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!selectedSession) return

    try {
      setDeleteLoading(true)
      const token = localStorage.getItem('token')

      const response = await fetch(`/api/admin/sessions/${selectedSession.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        setIsDeleteModalOpen(false)
        setSelectedSession(null)
        if (onRefresh) onRefresh()
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการลบเซสชัน')
      }
    } catch (error) {
      console.error('Error deleting session:', error)
      alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-0 overflow-hidden shadow-sm border border-purple-100">
        <div className="p-6 border-b border-purple-100 bg-purple-50/20">
          <h2 className="text-xl font-bold text-gray-900">รายการเซสชันการติดตามใบหน้า</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-purple-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">ชื่อเซสชัน</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">ผู้ใช้</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">เริ่มต้น</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">สิ้นสุด</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">ระยะเวลา</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">สถานะ</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-purple-800 uppercase tracking-wider">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                    ไม่พบเซสชันการติดตาม
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-purple-50/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {session.sessionName || 'ไม่ระบุชื่อ'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="font-medium text-gray-900">{session.user.firstName} {session.user.lastName}</span>
                      <br />
                      <span className="text-xs text-gray-400">{session.user.email}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(session.startTime)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {session.endTime ? formatDate(session.endTime) : 'กำลังดำเนินการ'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDuration(session.totalDuration)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        session.endTime ? 'bg-gray-100 text-gray-800' : 'bg-green-100 text-green-800 animate-pulse'
                      }`}>
                        {session.endTime ? 'เสร็จสิ้น' : 'กำลังดำเนินการ'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => onSessionClick(session.id)}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm hover:shadow-md cursor-pointer"
                        >
                          ดู Logs
                        </button>
                        <button
                          onClick={() => openDeleteModal(session)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="ลบเซสชัน"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* --- DELETE SESSION CONFIRMATION MODAL --- */}
      {isDeleteModalOpen && selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-red-100 p-6 flex flex-col gap-4">
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">ยืนยันการลบเซสชันการติดตาม?</h3>
              <p className="text-sm text-gray-500 mt-2">
                คุณแน่ใจหรือไม่ว่าต้องการลบเซสชัน <span className="font-semibold text-gray-800">{selectedSession.sessionName || 'ไม่ระบุชื่อ'}</span> ของ <span className="font-semibold text-gray-800">{selectedSession.user.firstName} {selectedSession.user.lastName}</span>? 
                การกระทำนี้จะลบข้อมูลล็อกการทำงานและสถิติทั้งหมดของเซสชันนี้อย่างถาวรและไม่สามารถกู้คืนได้!
              </p>
            </div>

            <div className="flex justify-end gap-3 mt-4 border-t border-gray-100 pt-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                disabled={deleteLoading}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer"
                disabled={deleteLoading}
              >
                {deleteLoading ? 'กำลังลบ...' : 'ยืนยันการลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}