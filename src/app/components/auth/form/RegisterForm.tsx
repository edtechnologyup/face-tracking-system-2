import { Input } from "@/app/components/ui/Input"
import { PasswordInput } from "@/app/components/ui/PasswordInput"
import { Select } from "@/app/components/ui/Select"
import { TITLE_OPTIONS } from "./TitleOptions"

interface RegisterFormProps {
  formData: {
    title: string
    firstName: string
    lastName: string
    studentId: string
    phoneNumber: string
    section: string
    email: string
    password: string
    confirmPassword: string
  }
  errors: Record<string, string>
  duplicateErrors: Record<string, string>
  onChange: (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onBlur: (field: string) => () => void
}

const SECTION_OPTIONS = [
  { value: "Sec 1", label: "Section 1 (กลุ่ม 1)" },
  { value: "Sec 2", label: "Section 2 (กลุ่ม 2)" }
]

export function RegisterForm({ 
  formData, 
  errors, 
  duplicateErrors, 
  onChange, 
  onBlur 
}: RegisterFormProps) {
  return (
    <>
      <Select
        label="คำนำหน้าชื่อ"
        value={formData.title}
        onChange={onChange("title")}
        placeholder="กรุณาเลือก"
        required
        error={errors.title}
        options={TITLE_OPTIONS}
      />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="ชื่อ"
          value={formData.firstName}
          onChange={onChange("firstName")}
          required
          error={errors.firstName}
        />
        <Input
          label="นามสกุล"
          value={formData.lastName}
          onChange={onChange("lastName")}
          required
          error={errors.lastName}
        />
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="รหัสผู้เรียน"
          value={formData.studentId}
          onChange={onChange("studentId")}
          onBlur={onBlur("studentId")}
          placeholder="650xxxx"
          error={errors.studentId || duplicateErrors.studentId}
        />
        
        <Select
          label="กลุ่มเรียน / เซกชัน"
          value={formData.section}
          onChange={onChange("section")}
          placeholder="กรุณาเลือกกลุ่มเรียน"
          required
          error={errors.section}
          options={SECTION_OPTIONS}
        />
      </div>
      
      <Input
        label="เบอร์โทรศัพท์"
        value={formData.phoneNumber}
        onChange={onChange("phoneNumber")}
        onBlur={onBlur("phoneNumber")}
        error={errors.phoneNumber || duplicateErrors.phoneNumber}
      />

      <Input
        label="อีเมล"
        type="email"
        value={formData.email}
        onChange={onChange("email")}
        onBlur={onBlur("email")}
        required
        error={errors.email || duplicateErrors.email}
      />

      <PasswordInput
        label="รหัสผ่าน"
        value={formData.password}
        onChange={onChange("password")}
        placeholder="••••••••"
        required
        showStrength={true}
        showToggle={true}
        error={errors.password}
      />

      <PasswordInput
        label="ยืนยันรหัสผ่าน"
        value={formData.confirmPassword}
        onChange={onChange("confirmPassword")}
        placeholder="••••••••"
        required
        showStrength={false}
        showToggle={false}
        error={errors.confirmPassword}
      />
    </>
  )
}