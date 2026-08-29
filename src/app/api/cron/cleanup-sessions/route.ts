import { NextRequest, NextResponse } from 'next/server'
import { autoCloseStaleSessions } from '@/lib/utils/session-cleanup'

/**
 * Vercel Cron Job: ทำความสะอาด session ที่ค้างอยู่เป็น IN_PROGRESS ทุก 2 นาที
 * แทนที่การเรียก autoCloseStaleSessions() ใน GET handlers
 * 
 * Config ใน vercel.json:
 * "crons": [{ "path": "/api/cron/cleanup-sessions", "schedule": "every 2 minutes" }]
 */
export async function GET(request: NextRequest) {
  // ตรวจสอบ Vercel Cron secret หรือ CRON_SECRET เพื่อป้องกันการเรียกจากภายนอก
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await autoCloseStaleSessions()
    console.log('🧹 Cron: Auto-close stale sessions completed')
    return NextResponse.json({ 
      success: true, 
      message: 'Stale session cleanup completed',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Cron cleanup error:', error)
    return NextResponse.json(
      { error: 'Cleanup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
