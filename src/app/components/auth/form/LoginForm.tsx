import { Input } from "@/app/components/ui/Input"
import { PasswordInput } from "@/app/components/ui/PasswordInput"
import Link from "next/link"

interface LoginFormProps {
  email: string
  password: string
  errors: Record<string, string>
  onChange: (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur: (field: string) => () => void
}

export function LoginForm({ 
  email, 
  password, 
  errors, 
  onChange, 
  onBlur 
}: LoginFormProps) {
  return (
    <>
      <Input
        label="อีเมล"
        type="email"
        value={email}
        onChange={onChange("email")}
        onBlur={onBlur("email")}
        required
        error={errors.email}
      />

      <div className="space-y-2">
        <PasswordInput
          label="รหัสผ่าน"
          value={password}
          onChange={onChange("password")}
          placeholder="••••••••"
          required
          showStrength={false}
          showToggle={true}
          error={errors.password}
        />
        <div className="flex justify-end">
          <Link 
            href="/forgot-password" 
            className="text-sm font-medium text-purple-600 hover:text-purple-800 transition-colors"
          >
            ลืมรหัสผ่านใช่หรือไม่?
          </Link>
        </div>
      </div>
    </>
  )
}