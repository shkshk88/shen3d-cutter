'use client'

import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'

interface AnnotationPointsProps {
  points: THREE.Vector3[]
}

export function AnnotationPoints({ points }: AnnotationPointsProps) {
  if (points.length === 0) return null

  return (
    <group>
      {points.map((point, i) => (
        <group key={i}>
          <mesh position={point}>
            <sphereGeometry args={[0.8, 16, 16]} />
            <meshStandardMaterial
              color="#10b981"
              emissive="#10b981"
              emissiveIntensity={0.5}
            />
          </mesh>
          <Html position={point} center>
            <div className="px-1 py-0.5 rounded text-[10px] font-bold bg-green-500 text-white">
              {i + 1}
            </div>
          </Html>
        </group>
      ))}
      {points.length > 1 && (
        <Line
          points={points}
          color="#10b981"
          lineWidth={2}
        />
      )}
    </group>
  )
}
