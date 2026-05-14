'use client'

import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'

interface ImplantMarkerProps {
  center: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  confidence: number
  index: number
  isSelected?: boolean
  onClick?: () => void
}

export function ImplantMarker({
  center, axis, radius, confidence, index, isSelected, onClick
}: ImplantMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const color = isSelected ? '#f59e0b' : '#ef4444'

  const axisPoints = useMemo(() => [
    center.clone().add(axis.clone().multiplyScalar(-radius * 3)),
    center.clone().add(axis.clone().multiplyScalar(radius * 3)),
  ], [center, axis, radius])

  const labelPos = useMemo(() =>
    center.clone().add(new THREE.Vector3(0, radius * 2, 0)),
  [center, radius])

  return (
    <group>
      <mesh
        ref={meshRef}
        position={center}
        onClick={(e) => { e.stopPropagation(); onClick?.() }}
      >
        <sphereGeometry args={[radius * 1.2, 32, 32]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Line
        points={axisPoints}
        color={color}
        lineWidth={2}
      />

      <Html position={labelPos} center>
        <div className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap
          ${isSelected ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'}`}>
          Impianto {index + 1}
          <br />R: {radius.toFixed(1)}mm
          <br />Conf: {(confidence * 100).toFixed(0)}%
        </div>
      </Html>
    </group>
  )
}
