'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'

interface ImplantMarkerProps {
  center: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  /** Altezza reale del camino (mm) */
  height?: number
  confidence: number
  index: number
  isSelected?: boolean
  onClick?: () => void
}

/**
 * Marker di un camino vite: cilindro fantasma lungo l'asse fittato,
 * con altezza e raggio reali in mm.
 */
export function ImplantMarker({
  center, axis, radius, height, confidence, index, isSelected, onClick
}: ImplantMarkerProps) {
  const color = isSelected ? '#f59e0b' : '#ef4444'
  const h = height && height > 0 ? height : radius * 6

  // cylinderGeometry è allineata a +Y: quaternione per ruotarla sull'asse del canale
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize())
    return q
  }, [axis])

  const axisPoints = useMemo(() => [
    center.clone().addScaledVector(axis, -h / 2 - 2),
    center.clone().addScaledVector(axis, h / 2 + 2),
  ], [center, axis, h])

  const labelPos = useMemo(() =>
    center.clone().addScaledVector(axis, h / 2 + 3),
  [center, axis, h])

  return (
    <group>
      <mesh
        position={center}
        quaternion={quaternion}
        onClick={(e) => { e.stopPropagation(); onClick?.() }}
      >
        <cylinderGeometry args={[radius, radius, h, 24, 1, true]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.5 : 0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <Line
        points={axisPoints}
        color={color}
        lineWidth={2}
      />

      <Html position={labelPos} center>
        <div
          className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap cursor-pointer
            ${isSelected ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'}`}
          onClick={() => onClick?.()}
        >
          Canale {index + 1}
          <br />R: {radius.toFixed(2)}mm · H: {h.toFixed(1)}mm
          <br />Conf: {(confidence * 100).toFixed(0)}%
        </div>
      </Html>
    </group>
  )
}
