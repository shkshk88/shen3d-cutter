'use client'

import { CuttingPlane, CuttingResult } from '@/lib/cutting-plane'
import { useMemo } from 'react'
import * as THREE from 'three'

interface CuttingPlaneVisualProps {
  cuttingResult: CuttingResult
  selectedPlaneId: string | null
  onPlaneSelect: (id: string | null) => void
}

function PlaneDisk({ plane, selected, onSelect }: {
  plane: CuttingPlane
  selected: boolean
  onSelect: () => void
}) {
  const color = plane.method === 'junction' ? '#f59e0b' : '#10b981'
  const size = 20

  const matrix = useMemo(() => {
    const m = new THREE.Matrix4()
    const up = new THREE.Vector3(0, 1, 0)
    const normal = plane.normal.clone().normalize()

    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal)
    m.makeRotationFromQuaternion(quaternion)
    m.setPosition(plane.point)
    return m
  }, [plane.point, plane.normal])

  return (
    <group matrix={matrix} onClick={(e) => { e.stopPropagation(); onSelect() }}>
      <mesh>
        <circleGeometry args={[size, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.5 : 0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <ringGeometry args={[size - 0.3, size, 64]} />
        <meshBasicMaterial
          color={selected ? '#ffffff' : color}
          transparent
          opacity={selected ? 0.9 : 0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(size * 2, size * 2)]} />
        <lineBasicMaterial color={color} transparent opacity={0.3} />
      </lineSegments>
    </group>
  )
}

export function CuttingPlaneVisual({ cuttingResult, selectedPlaneId, onPlaneSelect }: CuttingPlaneVisualProps) {
  return (
    <group>
      {cuttingResult.planes.map(plane => (
        <PlaneDisk
          key={plane.id}
          plane={plane}
          selected={plane.id === selectedPlaneId}
          onSelect={() => onPlaneSelect(plane.id === selectedPlaneId ? null : plane.id)}
        />
      ))}
    </group>
  )
}
