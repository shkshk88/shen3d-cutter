'use client'

import { CuttingPlane, CuttingResult, applyPlaneParams } from '@/lib/cutting-plane'
import { useMemo, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { ThreeEvent } from '@react-three/fiber'
import { PlaneParams } from './viewer-section'

interface CuttingPlaneVisualProps {
  cuttingResult: CuttingResult
  selectedPlaneId: string | null
  onPlaneSelect: (id: string | null) => void
  planeParams: Record<string, PlaneParams>
  onPlaneParamsChange?: (params: Record<string, PlaneParams>) => void
}

function PlaneDisk({ plane, selected, onSelect, params, onOffsetChange }: {
  plane: CuttingPlane
  selected: boolean
  onSelect: () => void
  params: PlaneParams
  onOffsetChange: (offset: number) => void
}) {
  const color = plane.method === 'junction' ? '#f59e0b' : '#10b981'
  const size = 20

  const effectivePlane = useMemo(() => {
    const modified: CuttingPlane = {
      ...plane,
      offset: params.offset,
      tiltAngle: params.tiltAngle,
      tiltAxis: plane.tiltAxis,
    }
    return applyPlaneParams(modified)
  }, [plane, params])

  const matrix = useMemo(() => {
    const m = new THREE.Matrix4()
    const up = new THREE.Vector3(0, 1, 0)
    const normal = effectivePlane.effectiveNormal.clone().normalize()

    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal)
    m.makeRotationFromQuaternion(quaternion)
    m.setPosition(effectivePlane.effectivePoint)
    return m
  }, [effectivePlane])

  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ pointOnNormal: number; offset: number } | null>(null)
  const normalDir = useRef(effectivePlane.effectiveNormal.clone().normalize())

  const projectOnNormal = useCallback((point: THREE.Vector3): number => {
    return point.dot(normalDir.current)
  }, [])

  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!selected) return
    e.stopPropagation()
    normalDir.current = effectivePlane.effectiveNormal.clone().normalize()
    dragStart.current = { pointOnNormal: projectOnNormal(e.point), offset: params.offset }
    setDragging(true)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }, [selected, effectivePlane, params.offset, projectOnNormal])

  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging || !dragStart.current) return
    e.stopPropagation()
    const currentOnNormal = projectOnNormal(e.point)
    const delta = currentOnNormal - dragStart.current.pointOnNormal
    const newOffset = Math.max(-10, Math.min(10, dragStart.current.offset + delta))
    onOffsetChange(Math.round(newOffset * 2) / 2)
  }, [dragging, projectOnNormal, onOffsetChange])

  const onPointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setDragging(false)
    dragStart.current = null
  }, [])

  const cursorStyle = dragging ? 'grabbing' : selected ? 'grab' : 'pointer'

  return (
    <group
      matrix={matrix}
      onClick={(e) => { e.stopPropagation(); if (!dragging) onSelect() }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <mesh>
        <circleGeometry args={[size, 64]} />
        <meshBasicMaterial
          color={dragging ? '#10b981' : color}
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
      {/* Invisible larger hit area for drag */}
      {selected && (
        <mesh visible={false}>
          <circleGeometry args={[size + 2, 64]} />
          <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

export function CuttingPlaneVisual({ cuttingResult, selectedPlaneId, onPlaneSelect, planeParams, onPlaneParamsChange }: CuttingPlaneVisualProps) {
  const handleOffsetChange = useCallback((planeId: string, offset: number) => {
    if (!onPlaneParamsChange) return
    const current = planeParams[planeId] ?? { offset: 0, tiltAngle: 0 }
    onPlaneParamsChange({
      ...planeParams,
      [planeId]: { ...current, offset },
    })
  }, [planeParams, onPlaneParamsChange])

  return (
    <group>
      {cuttingResult.planes.map(plane => (
        <PlaneDisk
          key={plane.id}
          plane={plane}
          selected={plane.id === selectedPlaneId}
          onSelect={() => onPlaneSelect(plane.id === selectedPlaneId ? null : plane.id)}
          params={planeParams[plane.id] ?? { offset: 0, tiltAngle: 0 }}
          onOffsetChange={(offset) => handleOffsetChange(plane.id, offset)}
        />
      ))}
    </group>
  )
}
