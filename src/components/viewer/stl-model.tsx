'use client'

import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three-stdlib'
import * as THREE from 'three'
import { useEffect, useRef, useState } from 'react'
import { analyzeMesh, MeshAnalysisResult } from '@/lib/mesh-analysis'
import { applyCurvatureColors } from './curvature-visualization'

interface StlModelProps {
  url: string
  onAnalysisComplete?: (result: MeshAnalysisResult) => void
  showCurvature?: boolean
  curvatureOpacity?: number
}

export function StlModel({ url, onAnalysisComplete, showCurvature, curvatureOpacity }: StlModelProps) {
  const geometry = useLoader(STLLoader, url)
  const meshRef = useRef<THREE.Mesh>(null)
  const [analysisData, setAnalysisData] = useState<MeshAnalysisResult | null>(null)

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
    setAnalysisData(result)
    onAnalysisComplete?.(result)
  }, [geometry])

  // Applica o rimuovi heat map curvatura
  useEffect(() => {
    if (!analysisData || !geometry) return

    if (showCurvature) {
      applyCurvatureColors(geometry, analysisData.curvature)
    } else {
      geometry.deleteAttribute('color')
    }

    geometry.attributes.position.needsUpdate = true
    if (geometry.attributes.color) {
      geometry.attributes.color.needsUpdate = true
    }
  }, [showCurvature, analysisData, geometry])

  const hasVertexColors = showCurvature && !!geometry.getAttribute('color')

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={hasVertexColors ? '#ffffff' : '#a0c4ff'}
        metalness={0.2}
        roughness={0.6}
        side={THREE.DoubleSide}
        vertexColors={hasVertexColors}
        transparent={showCurvature && (curvatureOpacity ?? 1) < 1}
        opacity={showCurvature ? (curvatureOpacity ?? 1) : 1}
      />
    </mesh>
  )
}
