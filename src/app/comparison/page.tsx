'use client'
import { useRouter } from 'next/navigation'
import { Button } from '@/app/components/ui/Button'
import { EngineComparison } from '@/app/components/tracking/EngineComparison'

export default function ComparisonPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Header Navbar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-white shadow-md">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Face Detection Benchmark Lab</h1>
              <p className="text-xs text-gray-500">ระบบเปรียบเทียบประสิทธิภาพ 4 เครื่องมือตรวจจับใบหน้า</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              onClick={() => router.push('/tracking')}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-xl transition-all"
            >
              📹 หน้าจอตรวจจับปกติ
            </Button>
            <Button
              onClick={() => router.push('/admin')}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-xl transition-all shadow-sm"
            >
              📊 Admin Dashboard
            </Button>
          </div>
        </div>
      </header>

      {/* Main Comparison Dashboard Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        <EngineComparison />
      </main>
    </div>
  )
}
