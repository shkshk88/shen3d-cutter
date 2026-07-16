'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'

interface InsertionAxisWidgetProps {
  /** Asse di inserzione unitario (mm frame) */
  axis: THREE.Vector3
  boundingBox: THREE.Box3
}

/**
 * Freccia indigo che mostra l'asse di inserzione della sovrastruttura,
 * posizionata sopra il modello. La direzione della freccia indica il verso
 * di estrazione (la sovrastruttura si sfila lungo +asse).
 */
export function InsertionAxisWidget({ axis, boundingBox }: InsertionAxisWidgetProps) {
  const { start, end, tip } = useMemo(() => {
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    boundingBox.getCenter(center)
    boundingBox.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)

    const dir = axis.clone().normalize()
    const base = center.clone().addScaledVector(dir, maxDim * 0.55)
    const length = maxDim * 0.25

    return {
      start: base,
      end: base.clone().addScaledVector(dir, length),
      tip: base.clone().addScaledVector(dir, length * 1.15),
    }
  }, [axis, boundingBox])

  const coneQuaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize())
    return q
  }, [axis])

  return (
    <group>
      <Line points={[start, end]} color="#6366f1" lineWidth={3} />
      <mesh position={end} quaternion={coneQuaternion}>
        <coneGeometry args={[1.2, 3, 16]} />
        <meshStandardMaterial color="#6366f1" />
      </mesh>
      <Html position={tip} center>
        <div className="px-2 py-0.5 rounded bg-indigo-500/90 text-white text-[10px] font-medium whitespace-nowrap">
          Asse inserzione
        </div>
      </Html>
    </group>
  )
}
