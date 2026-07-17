'use client'

import { useCallback, useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useThree, ThreeEvent } from '@react-three/fiber'
import { SplitCurve } from '@/lib/split-curve'

interface SplitCurveVisualProps {
  curve: SplitCurve
  densified: THREE.Vector3[]
  selectedIndex: number | null
  /** Geometria del modello (con boundsTree) per il drag incollato alla superficie */
  geometry: THREE.BufferGeometry | null
  /** Asse di inserzione: per le curve libere il drag avviene sul piano di quota ⊥ asse */
  insertionAxis?: THREE.Vector3 | null
  editable: boolean
  valid: boolean
  onSelectPoint: (index: number | null) => void
  onMovePoint: (index: number, point: THREE.Vector3) => void
  onBeginDrag: () => void
  onInsertPoint: (point: THREE.Vector3) => void
  onDeletePoint: (index: number) => void
}

/**
 * Rendering ed editing della curva di split: tubo ambra (rosso se invalida)
 * + sfere di controllo indigo. Drag di un punto = raycast continuo sulla
 * superficie della mesh via BVH (il punto resta incollato al modello).
 */
export function SplitCurveVisual({
  curve, densified, selectedIndex, geometry, insertionAxis, editable, valid,
  onSelectPoint, onMovePoint, onBeginDrag, onInsertPoint, onDeletePoint,
}: SplitCurveVisualProps) {
  const { camera, gl, controls } = useThree()
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const raycaster = useRef(new THREE.Raycaster())

  const curveColor = valid ? '#f59e0b' : '#ef4444'

  const linePoints = useMemo(() => {
    if (densified.length < 2) return null
    return curve.closed ? [...densified, densified[0]] : densified
  }, [densified, curve.closed])

  /** Raycast dal pointer sulla superficie della mesh (BVH) */
  const raycastToSurface = useCallback((clientX: number, clientY: number): THREE.Vector3 | null => {
    const bvh = geometry?.boundsTree
    if (!bvh) return null
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.current.setFromCamera(ndc, camera)
    const hit = bvh.raycastFirst(raycaster.current.ray, THREE.DoubleSide)
    return hit ? hit.point.clone() : null
  }, [geometry, gl, camera])

  /** Per curve libere: intersezione del pointer col piano di quota ⊥ asse */
  const raycastToPlane = useCallback((clientX: number, clientY: number, through: THREE.Vector3): THREE.Vector3 | null => {
    const axis = insertionAxis?.clone().normalize() ?? new THREE.Vector3(0, 1, 0)
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.current.setFromCamera(ndc, camera)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, through)
    const out = new THREE.Vector3()
    return raycaster.current.ray.intersectPlane(plane, out) ? out : null
  }, [insertionAxis, gl, camera])

  const startDrag = useCallback((index: number, e: ThreeEvent<PointerEvent>) => {
    if (!editable) return
    e.stopPropagation()
    onSelectPoint(index)
    onBeginDrag()
    setDraggingIndex(index)

    const orbitControls = controls as unknown as { enabled: boolean } | null
    // OrbitControls va disabilitato durante il drag (mutazione imperativa
    // dell'istanza three, non di stato React)
    // eslint-disable-next-line react-hooks/immutability
    if (orbitControls) orbitControls.enabled = false

    const dragOrigin = curve.controlPoints[index].clone()
    const handleMove = (ev: PointerEvent) => {
      const point = curve.mode === 'free'
        ? raycastToPlane(ev.clientX, ev.clientY, dragOrigin)
        : raycastToSurface(ev.clientX, ev.clientY)
      if (point) onMovePoint(index, point)
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      if (orbitControls) orbitControls.enabled = true
      setDraggingIndex(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }, [editable, controls, curve, onSelectPoint, onBeginDrag, onMovePoint, raycastToSurface, raycastToPlane])

  const handleSphereClick = useCallback((index: number, e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!editable) return
    if (e.altKey) {
      onDeletePoint(index)
    } else {
      onSelectPoint(selectedIndex === index ? null : index)
    }
  }, [editable, selectedIndex, onSelectPoint, onDeletePoint])

  const handleLineDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!editable) return
    e.stopPropagation()
    const point = raycastToSurface(e.nativeEvent.clientX, e.nativeEvent.clientY)
    if (point) onInsertPoint(point)
  }, [editable, raycastToSurface, onInsertPoint])

  return (
    <group>
      {linePoints && (
        <Line
          points={linePoints}
          color={curveColor}
          lineWidth={3}
          onDoubleClick={handleLineDoubleClick}
        />
      )}

      {curve.controlPoints.map((point, i) => {
        const isSelected = selectedIndex === i
        const isDragging = draggingIndex === i
        return (
          <mesh
            key={i}
            position={point}
            onClick={(e) => handleSphereClick(i, e)}
            onPointerDown={(e) => startDrag(i, e)}
          >
            <sphereGeometry args={[isSelected || isDragging ? 0.9 : 0.65, 16, 16]} />
            <meshBasicMaterial
              color={isDragging ? '#10b981' : isSelected ? '#f59e0b' : '#6366f1'}
              transparent
              opacity={0.95}
              depthTest={false}
            />
          </mesh>
        )
      })}

      {/* Indicatore del primo punto (dove si chiude il loop) */}
      {!curve.closed && curve.controlPoints.length >= 3 && (
        <mesh position={curve.controlPoints[0]}>
          <ringGeometry args={[1.0, 1.3, 24]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.8} side={THREE.DoubleSide} depthTest={false} />
        </mesh>
      )}
    </group>
  )
}
