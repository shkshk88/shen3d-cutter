'use client'

import { CutLine } from '@/lib/cutting-plane'
import { Line } from '@react-three/drei'

interface CutLineVisualProps {
  lines: CutLine[]
}

function CutLineRender({ line }: { line: CutLine }) {
  if (line.points.length < 2) return null

  const method = line.planeId.includes('junction') ? 'junction' :
                 line.planeId.includes('unified') ? 'midpoint' : 'curvature'
  const color = method === 'junction' ? '#f59e0b' : method === 'midpoint' ? '#10b981' : '#6366f1'

  const points = line.points.map(p => [p.x, p.y, p.z] as [number, number, number])

  return (
    <Line
      points={points}
      color={color}
      lineWidth={2}
      transparent
      opacity={0.9}
    />
  )
}

export function CutLineVisual({ lines }: CutLineVisualProps) {
  return (
    <group>
      {lines.map(line => (
        <CutLineRender key={line.id} line={line} />
      ))}
    </group>
  )
}
