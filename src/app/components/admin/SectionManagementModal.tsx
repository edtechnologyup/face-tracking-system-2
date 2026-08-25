'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/app/components/ui/Card'
import { Button } from '@/app/components/ui/Button'
import { Input } from '@/app/components/ui/Input'
import toast from 'react-hot-toast'

interface SectionItem {
  id: string
  code: string
  name: string
}

interface SectionManagementModalProps {
  isOpen: boolean
  onClose: () => void
  onSectionsUpdated?: () => void
}

export function SectionManagementModal({ isOpen, onClose, onSectionsUpdated }: SectionManagementModalProps) {
  const [sections, setSections] = useState<SectionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  
  // New section form state
  const [newCode, setNewCode] = useState('')
  const [error, setError] = useState('')

  const fetchSections = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/sections')
      const data = await res.json()
      if (res.ok && data.success) {
        setSections(data.sections || [])
      }
    } catch (err) {
      console.error('Fetch sections error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchSections()
      setError('')
      setNewCode('')
    }
  }, [isOpen, fetchSections])

  if (!isOpen) return null

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCode.trim()) {
      setError('กรุณากรอกชื่อกลุ่มเรียน (เช่น Sec 11)')
      return
    }

    try {
      setActionLoading(true)
      setError('')
      const token = localStorage.getItem('token')

      const res = await fetch('/api/admin/sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code: newCode.trim()
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'ไม่สามารถเพิ่มกลุ่มเรียนได้')
      }

      toast.success(data.message || 'เพิ่มกลุ่มเรียนสำเร็จ')
      setNewCode('')
      await fetchSections()
      onSectionsUpdated?.()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเพิ่มกลุ่มเรียน')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteSection = async (section: SectionItem) => {
    if (!confirm(`คุณต้องการลบกลุ่มเรียน "${section.code}" ใช่หรือไม่?`)) {
      return
    }

    try {
      setActionLoading(true)
      const token = localStorage.getItem('token')

      const res = await fetch(`/api/admin/sections?id=${section.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'ไม่สามารถลบกลุ่มเรียนได้')
      }

      toast.success(data.message || 'ลบกลุ่มเรียนสำเร็จ')
      await fetchSections()
      onSectionsUpdated?.()

    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบกลุ่มเรียน')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <Card className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="text-lg font-bold">จัดการกลุ่มเรียน (Section Management)</h2>
              <p className="text-xs text-purple-100">เพิ่มหรือลบกลุ่มเรียนสำหรับผู้เรียนในระบบ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-purple-200 hover:text-white transition-colors p-1 text-2xl font-bold leading-none"
          >
            &times;
          </button>
        </div>

        {/* Form เพิ่มกลุ่มเรียน */}
        <div className="p-5 bg-purple-50/50 border-b border-purple-100">
          <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-1.5">
            <span>➕</span> เพิ่มกลุ่มเรียนใหม่
          </h3>

          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-medium">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleAddSection} className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <Input
                label="ชื่อกลุ่มเรียน (Section Code)"
                placeholder="เช่น Sec 11"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={actionLoading}
              className="w-full sm:w-auto px-6 bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 text-sm shadow-sm"
            >
              {actionLoading ? 'กำลังบันทึก...' : 'เพิ่มกลุ่มเรียน'}
            </Button>
          </form>
        </div>

        {/* รายการกลุ่มเรียนทั้งหมด */}
        <div className="p-5 flex-1 overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-800">
              รายการกลุ่มเรียนทั้งหมด ({sections.length} กลุ่ม)
            </h3>
            {loading && <span className="text-xs text-purple-600 animate-pulse">กำลังโหลดข้อมูล...</span>}
          </div>

          {sections.length === 0 && !loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              ไม่พบบันทึกกลุ่มเรียนในระบบ
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sections.map((section) => (
                <div
                  key={section.id}
                  className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex justify-between items-center hover:border-purple-300 transition-colors shadow-sm"
                >
                  <div className="font-bold text-sm text-purple-900 truncate flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0"></span>
                    {section.code}
                  </div>

                  <button
                    onClick={() => handleDeleteSection(section)}
                    disabled={actionLoading}
                    title="ลบกลุ่มเรียนนี้"
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <Button onClick={onClose} variant="secondary" className="px-5 text-sm">
            ปิดหน้าต่าง
          </Button>
        </div>
      </Card>
    </div>
  )
}
