'use client'

import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three-stdlib'
import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { analyzeMesh, MeshAnalysisResult } from '@/lib/mesh-analysis'

interface StlModelProps {
  url: string
  onAnalysisComplete?: (result: MeshAnalysisResult) => void
}

export function StlModel({ url, onAnalysisComplete }: StlModelProps) {
  const geometry = useLoader(STLLoader, url)
  const meshRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    if (!geometry) return
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    const center = new THREE.Vector3()
    box.getCenter(center)
    geometry.translate(-center.x, -center.y, -center.z)

    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      const scale = 80 / maxDim
      geometry.scale(scale, scale, scale)
    }

    geometry.computeVertexNormals()

    const result = analyzeMesh(geometry)
    onAnalysisComplete?.(result)
  }, [geometry])

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color="#a0c4ff"
        metalness={0.2}
        roughness={0.6}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
