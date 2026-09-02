'use client'
import { Button } from '@/app/components/ui/Button'

interface ControlPanelProps {
  isActive: boolean
  onStop: () => void
}

export function ControlPanel({ isActive, onStop }: ControlPanelProps) {
  if (!isActive) return null

  return (
    <div className="flex justify-center mt-4 sm:mt-6 px-1">
      <Button
        onClick={onStop}
        variant="secondary"
        className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 text-base min-h-[48px] active:scale-[0.98] transition-transform"
      >
        ⏹️ หยุดติดตาม & บันทึก
      </Button>
    </div>
  )
}
