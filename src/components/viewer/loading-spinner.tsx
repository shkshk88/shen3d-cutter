'use client'

import { useProgress, Html } from '@react-three/drei'

export function LoadingSpinner() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">{Math.round(progress)}%</p>
      </div>
    </Html>
  )
}
