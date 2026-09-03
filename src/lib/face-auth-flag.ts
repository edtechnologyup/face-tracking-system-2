/**
 * Face login / register / password-reset verification (2FA).
 * MediaPipe exam tracking is independent of this flag.
 *
 * Default: off. Re-enable later with NEXT_PUBLIC_ENABLE_FACE_AUTH=true
 */
export function isFaceAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_FACE_AUTH === 'true'
}

export const FACE_AUTH_DISABLED_MESSAGE =
  'ระบบยืนยันใบหน้าถูกปิดชั่วคราว กรุณาใช้รหัสผ่าน'
