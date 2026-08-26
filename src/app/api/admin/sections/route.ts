import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import jwt from 'jsonwebtoken'

// Default 10 Sections for seeding
const DEFAULT_SECTIONS = Array.from({ length: 10 }, (_, i) => ({
  code: `Sec ${i + 1}`,
  name: `Sec ${i + 1}`
}))

// Helper: Verify Admin Role
async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; error?: NextResponse }> {
  const authorization = request.headers.get('authorization')
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return { isAdmin: false, error: NextResponse.json({ error: 'ไม่พบ token การยืนยันตัวตน' }, { status: 401 }) }
  }

  const token = authorization.substring(7)
  const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret'

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string }
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true }
    })

    if (!user || user.role !== 'ADMIN') {
      return { isAdmin: false, error: NextResponse.json({ error: 'ไม่มีสิทธิ์ผู้ดูแลระบบ' }, { status: 403 }) }
    }

    return { isAdmin: true }
  } catch {
    return { isAdmin: false, error: NextResponse.json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' }, { status: 401 }) }
  }
}

// Helper for safe section model access across all platforms
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sectionModel = () => (prisma as any).section

// GET: ดึงรายการกลุ่มเรียนทั้งหมด (หากยังไม่มี ให้ Auto-Seed 10 กลุ่มแรกให้อัตโนมัติ)
export async function GET() {
  try {
    let sections = await sectionModel().findMany({
      orderBy: { createdAt: 'asc' }
    })

    // Auto-seed if database sections table is empty
    if (sections.length === 0) {
      console.log('Seeding initial 10 sections...')
      await sectionModel().createMany({
        data: DEFAULT_SECTIONS,
        skipDuplicates: true
      })

      sections = await sectionModel().findMany({
        orderBy: { createdAt: 'asc' }
      })
    }

    return NextResponse.json({
      success: true,
      sections: sections.map((s: { id: string; code: string; name: string }) => ({
        id: s.id,
        code: s.code,
        name: s.name
      }))
    })
  } catch (error) {
    console.error('Fetch sections error, returning default fallback sections:', error)
    return NextResponse.json({
      success: true,
      sections: DEFAULT_SECTIONS.map((s, idx) => ({
        id: `fallback-${idx}`,
        code: s.code,
        name: s.name
      }))
    })
  }
}

// POST: เพิ่มกลุ่มเรียนใหม่ (Admin Only)
export async function POST(request: NextRequest) {
  try {
    const authCheck = await verifyAdmin(request)
    if (!authCheck.isAdmin) return authCheck.error!

    const body = await request.json()
    const { code, name } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'กรุณาระบุรหัสกลุ่มเรียน (เช่น Sec 11)' }, { status: 400 })
    }

    const trimmedCode = code.trim()
    const formattedName = name?.trim() || trimmedCode

    // Check duplicate
    const existing = await sectionModel().findUnique({
      where: { code: trimmedCode }
    })

    if (existing) {
      return NextResponse.json({ error: `กลุ่มเรียน ${trimmedCode} มีอยู่ในระบบแล้ว` }, { status: 400 })
    }

    const newSection = await sectionModel().create({
      data: {
        code: trimmedCode,
        name: formattedName
      }
    })

    return NextResponse.json({
      success: true,
      message: `เพิ่มกลุ่มเรียน ${newSection.code} สำเร็จ`,
      section: newSection
    }, { status: 201 })

  } catch (error) {
    console.error('Create section error:', error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการสร้างกลุ่มเรียน' }, { status: 500 })
  }
}

// DELETE: ลบกลุ่มเรียน (Admin Only)
export async function DELETE(request: NextRequest) {
  try {
    const authCheck = await verifyAdmin(request)
    if (!authCheck.isAdmin) return authCheck.error!

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const code = searchParams.get('code')

    if (!id && !code) {
      return NextResponse.json({ error: 'กรุณาระบุ ID หรือ Code ของกลุ่มเรียนที่ต้องการลบ' }, { status: 400 })
    }

    let targetId = id
    if (!targetId && code) {
      const found = await sectionModel().findUnique({ where: { code } })
      if (!found) {
        return NextResponse.json({ error: 'ไม่พบกลุ่มเรียนที่ระบุ' }, { status: 404 })
      }
      targetId = found.id
    }

    await sectionModel().delete({
      where: { id: targetId! }
    })

    return NextResponse.json({
      success: true,
      message: 'ลบกลุ่มเรียนสำเร็จ'
    })

  } catch (error) {
    console.error('Delete section error:', error)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการลบกลุ่มเรียน' }, { status: 500 })
  }
}
