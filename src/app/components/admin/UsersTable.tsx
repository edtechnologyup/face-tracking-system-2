'use client'

import { useState } from 'react'
import { Card } from '@/app/components/ui/Card'
import { Button } from '@/app/components/ui/Button'
import { Input } from '@/app/components/ui/Input'
import { Select } from '@/app/components/ui/Select'
import { PasswordInput } from '@/app/components/ui/PasswordInput'
import { TITLE_OPTIONS } from '@/app/components/auth/form/TitleOptions'
import { formatThaiDateTime } from '@/lib/utils/datetime'
import { 
  validateName, 
  validateEmail, 
  validateStudentId, 
  validatePassword, 
  validateTitle, 
  validatePhoneNumber 
} from '@/lib/utils/validation'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  studentId: string | null
  phoneNumber: string | null
  role: string
  isActive: boolean
  createdAt: string
}

interface UsersTableProps {
  users: User[]
  onRefresh?: () => void
}

export function UsersTable({ users, onRefresh }: UsersTableProps) {
  // Modals visibility
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  // Form State
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    title: '',
    firstName: '',
    lastName: '',
    studentId: '',
    phoneNumber: '',
    role: 'USER',
    isActive: true
  })

  // Errors & Loading State
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitLoading, setSubmitLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

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

  // Open Modals & Reset Form
  const openAddModal = () => {
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      title: '',
      firstName: '',
      lastName: '',
      studentId: '',
      phoneNumber: '',
      role: 'USER',
      isActive: true
    })
    setErrors({})
    setApiError(null)
    setIsAddModalOpen(true)
  }

  const openEditModal = (user: User) => {
    setSelectedUser(user)
    setFormData({
      email: user.email,
      password: '', // blank password unless modifying
      confirmPassword: '',
      title: user.firstName.split(' ')[0] || '', // Guessing title or blank
      firstName: user.firstName,
      lastName: user.lastName,
      studentId: user.studentId || '',
      phoneNumber: user.phoneNumber || '',
      role: user.role,
      isActive: user.isActive
    })
    // Match title from known lists or leave blank
    const foundTitle = TITLE_OPTIONS.find(opt => user.firstName.startsWith(opt.value))
    if (foundTitle) {
      const titleLen = foundTitle.value.length
      setFormData({
        email: user.email,
        password: '',
        confirmPassword: '',
        title: foundTitle.value,
        firstName: user.firstName.substring(titleLen).trim(),
        lastName: user.lastName,
        studentId: user.studentId || '',
        phoneNumber: user.phoneNumber || '',
        role: user.role,
        isActive: user.isActive
      })
    }

    setErrors({})
    setApiError(null)
    setIsEditModalOpen(true)
  }

  const openDeleteModal = (user: User) => {
    setSelectedUser(user)
    setIsDeleteModalOpen(true)
  }

  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // Validation
  const validateForm = (isEdit: boolean) => {
    const newErrors: Record<string, string> = {}

    const emailValidation = validateEmail(formData.email)
    if (!emailValidation.isValid) newErrors.email = emailValidation.error || 'อีเมลไม่ถูกต้อง'

    const titleValidation = validateTitle(formData.title)
    if (!titleValidation.isValid) newErrors.title = titleValidation.error || 'กรุณาเลือกคำนำหน้าชื่อ'

    const firstNameValidation = validateName(formData.firstName)
    if (!firstNameValidation.isValid) newErrors.firstName = firstNameValidation.error || 'ชื่อไม่ถูกต้อง'

    const lastNameValidation = validateName(formData.lastName)
    if (!lastNameValidation.isValid) newErrors.lastName = lastNameValidation.error || 'นามสกุลไม่ถูกต้อง'

    if (formData.studentId) {
      const studentIdValidation = validateStudentId(formData.studentId)
      if (!studentIdValidation.isValid) newErrors.studentId = studentIdValidation.error || 'รหัสผู้เรียนไม่ถูกต้อง'
    }

    if (formData.phoneNumber) {
      const phoneValidation = validatePhoneNumber(formData.phoneNumber)
      if (!phoneValidation.isValid) newErrors.phoneNumber = phoneValidation.error || 'เบอร์โทรศัพท์ไม่ถูกต้อง'
    }

    // Password validation for add, or edit only if typed
    if (!isEdit || formData.password) {
      const passwordValidation = validatePassword(formData.password)
      if (!passwordValidation.isValid) {
        newErrors.password = 'รหัสผ่านไม่ปลอดภัยเพียงพอ (ต้องมีอย่างน้อย 8 อักขระ พิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ)'
      }

      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'รหัสผ่านไม่ตรงกัน'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // API Call: Add User
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm(false)) return

    try {
      setSubmitLoading(true)
      setApiError(null)
      const token = localStorage.getItem('token')

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        setIsAddModalOpen(false)
        if (onRefresh) onRefresh()
      } else {
        setApiError(data.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล')
      }
    } catch (error) {
      console.error('Error adding user:', error)
      setApiError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    } finally {
      setSubmitLoading(false)
    }
  }

  // API Call: Edit User
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser || !validateForm(true)) return

    try {
      setSubmitLoading(true)
      setApiError(null)
      const token = localStorage.getItem('token')

      // Prepare payload (only send non-empty password if reset)
      const payload: {
        email: string
        title: string
        firstName: string
        lastName: string
        studentId: string | null
        phoneNumber: string | null
        role: string
        isActive: boolean
        password?: string
      } = {
        email: formData.email,
        title: formData.title,
        firstName: formData.firstName,
        lastName: formData.lastName,
        studentId: formData.studentId || null,
        phoneNumber: formData.phoneNumber || null,
        role: formData.role,
        isActive: formData.isActive
      }

      if (formData.password) {
        payload.password = formData.password
      }

      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (response.ok) {
        setIsEditModalOpen(false)
        if (onRefresh) onRefresh()
      } else {
        setApiError(data.error || 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล')
      }
    } catch (error) {
      console.error('Error editing user:', error)
      setApiError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    } finally {
      setSubmitLoading(false)
    }
  }

  // API Call: Delete User
  const handleDeleteConfirm = async () => {
    if (!selectedUser) return

    try {
      setSubmitLoading(true)
      setApiError(null)
      const token = localStorage.getItem('token')

      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        setIsDeleteModalOpen(false)
        setSelectedUser(null)
        if (onRefresh) onRefresh()
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการลบผู้ใช้งาน')
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">จัดการข้อมูลผู้ใช้งาน</h2>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          เพิ่มผู้ใช้งาน
        </button>
      </div>

      <Card className="p-0 overflow-hidden shadow-sm border border-purple-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-purple-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">อีเมล</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">รหัสนักศึกษา</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">สิทธิ์</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">สถานะ</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">เบอร์โทร</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-purple-800 uppercase tracking-wider">วันที่สมัคร</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-purple-800 uppercase tracking-wider">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                    ไม่พบข้อมูลผู้ใช้งาน
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-purple-50/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.studentId || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'ADMIN' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {user.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-850'
                      }`}>
                        {user.isActive ? 'ใช้งานปกติ' : 'ระงับการใช้งาน'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.phoneNumber || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(user.createdAt)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="แก้ไขข้อมูล"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openDeleteModal(user)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="ลบผู้ใช้"
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

      {/* --- ADD USER MODAL --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-purple-100 p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">เพิ่มผู้ใช้งานใหม่</h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {apiError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100">
                {apiError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <Select
                    label="คำนำหน้า"
                    value={formData.title}
                    onChange={handleInputChange('title')}
                    placeholder="เลือก"
                    required
                    error={errors.title}
                    options={TITLE_OPTIONS}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    label="ชื่อจริง"
                    value={formData.firstName}
                    onChange={handleInputChange('firstName')}
                    required
                    error={errors.firstName}
                  />
                </div>
              </div>

              <Input
                label="นามสกุล"
                value={formData.lastName}
                onChange={handleInputChange('lastName')}
                required
                error={errors.lastName}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="รหัสนักศึกษา (ถ้ามี)"
                  value={formData.studentId}
                  onChange={handleInputChange('studentId')}
                  placeholder="65xxxxxx"
                  error={errors.studentId}
                />
                <Input
                  label="เบอร์โทรศัพท์ (ถ้ามี)"
                  value={formData.phoneNumber}
                  onChange={handleInputChange('phoneNumber')}
                  placeholder="08xxxxxxxx"
                  error={errors.phoneNumber}
                />
              </div>

              <Input
                label="อีเมล"
                type="email"
                value={formData.email}
                onChange={handleInputChange('email')}
                required
                error={errors.email}
              />

              <div className="grid grid-cols-2 gap-4">
                <PasswordInput
                  label="รหัสผ่าน"
                  value={formData.password}
                  onChange={handleInputChange('password')}
                  required
                  error={errors.password}
                />
                <PasswordInput
                  label="ยืนยันรหัสผ่าน"
                  value={formData.confirmPassword}
                  onChange={handleInputChange('confirmPassword')}
                  required
                  error={errors.confirmPassword}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  สิทธิ์ผู้ใช้งาน <span className="text-purple-500">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="USER"
                      checked={formData.role === 'USER'}
                      onChange={handleInputChange('role')}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    ผู้ใช้งานปกติ (USER)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="ADMIN"
                      checked={formData.role === 'ADMIN'}
                      onChange={handleInputChange('role')}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    ผู้ดูแลระบบ (ADMIN)
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button 
                  variant="secondary" 
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={submitLoading}
                >
                  ยกเลิก
                </Button>
                <Button 
                  type="submit" 
                  disabled={submitLoading}
                >
                  {submitLoading ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT USER MODAL --- */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-purple-100 p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">แก้ไขข้อมูลผู้ใช้งาน</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {apiError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100">
                {apiError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <Select
                    label="คำนำหน้า"
                    value={formData.title}
                    onChange={handleInputChange('title')}
                    placeholder="เลือก"
                    required
                    error={errors.title}
                    options={TITLE_OPTIONS}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    label="ชื่อจริง"
                    value={formData.firstName}
                    onChange={handleInputChange('firstName')}
                    required
                    error={errors.firstName}
                  />
                </div>
              </div>

              <Input
                label="นามสกุล"
                value={formData.lastName}
                onChange={handleInputChange('lastName')}
                required
                error={errors.lastName}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="รหัสนักศึกษา (ถ้ามี)"
                  value={formData.studentId}
                  onChange={handleInputChange('studentId')}
                  placeholder="65xxxxxx"
                  error={errors.studentId}
                />
                <Input
                  label="เบอร์โทรศัพท์ (ถ้ามี)"
                  value={formData.phoneNumber}
                  onChange={handleInputChange('phoneNumber')}
                  placeholder="08xxxxxxxx"
                  error={errors.phoneNumber}
                />
              </div>

              <Input
                label="อีเมล"
                type="email"
                value={formData.email}
                onChange={handleInputChange('email')}
                required
                error={errors.email}
              />

              <div className="bg-purple-50/50 p-4 rounded-xl space-y-3 border border-purple-100">
                <h4 className="text-sm font-semibold text-purple-900">เปลี่ยนรหัสผ่าน (เว้นว่างไว้หากไม่ต้องการเปลี่ยน)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <PasswordInput
                    label="รหัสผ่านใหม่"
                    value={formData.password}
                    onChange={handleInputChange('password')}
                    error={errors.password}
                  />
                  <PasswordInput
                    label="ยืนยันรหัสผ่านใหม่"
                    value={formData.confirmPassword}
                    onChange={handleInputChange('confirmPassword')}
                    error={errors.confirmPassword}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">สิทธิ์ผู้ใช้งาน</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="role"
                        value="USER"
                        checked={formData.role === 'USER'}
                        onChange={handleInputChange('role')}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      ผู้ใช้งาน (USER)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="role"
                        value="ADMIN"
                        checked={formData.role === 'ADMIN'}
                        onChange={handleInputChange('role')}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      แอดมิน (ADMIN)
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">สถานะการบัญชี</label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                    />
                    เปิดใช้งานปกติ
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button 
                  variant="secondary" 
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={submitLoading}
                >
                  ยกเลิก
                </Button>
                <Button 
                  type="submit" 
                  disabled={submitLoading}
                >
                  {submitLoading ? 'กำลังอัปเดต...' : 'อัปเดตข้อมูล'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DELETE USER CONFIRMATION MODAL --- */}
      {isDeleteModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-red-100 p-6 flex flex-col gap-4">
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">ยืนยันการลบผู้ใช้งาน?</h3>
              <p className="text-sm text-gray-500 mt-2">
                คุณแน่ใจหรือไม่ว่าต้องการลบ <span className="font-semibold text-gray-800">{selectedUser.firstName} {selectedUser.lastName}</span>? 
                การกระทำนี้จะลบข้อมูลเซสชันการติดตาม (Tracking Sessions) และประวัติทั้งหมดของผู้ใช้คนนี้อย่างถาวรและไม่สามารถกู้คืนได้!
              </p>
            </div>

            <div className="flex justify-end gap-3 mt-4 border-t border-gray-100 pt-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                disabled={submitLoading}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer"
                disabled={submitLoading}
              >
                {submitLoading ? 'กำลังลบ...' : 'ยืนยันการลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}