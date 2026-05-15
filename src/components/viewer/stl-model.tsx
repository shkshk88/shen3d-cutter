'use client'

import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three-stdlib'
import * as THREE from 'three'
import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeMesh, MeshAnalysisResult } from '@/lib/mesh-analysis'
import { applyCurvatureColors } from './curvature-visualization'
import { CuttingPlane, applyPlaneParams } from '@/lib/cutting-plane'
import { PlaneParams } from './viewer-section'

interface SeparationPlane {
  normal: THREE.Vector3
  point: THREE.Vector3
}

interface StlModelProps {
  url: string
  onAnalysisComplete?: (result: MeshAnalysisResult) => void
  showCurvature?: boolean
  curvatureOpacity?: number
  annotationMode?: boolean
  onMeshClick?: (point: THREE.Vector3) => void
  onGeometryReady?: (geometry: THREE.BufferGeometry) => void
  showSeparation?: boolean
  separationPlane?: SeparationPlane | null
}

function applySeparationColors(geometry: THREE.BufferGeometry, plane: SeparationPlane) {
  const positionAttr = geometry.getAttribute('position')
  if (!positionAttr) return

  const normal = plane.normal.clone().normalize()
  const constant = -normal.dot(plane.point)
  const threePlane = new THREE.Plane(normal, constant)

  const count = positionAttr.count
  const colors = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    const x = positionAttr.getX(i)
    const y = positionAttr.getY(i)
    const z = positionAttr.getZ(i)
    const dist = threePlane.distanceToPoint(new THREE.Vector3(x, y, z))

    if (dist > 0) {
      colors[i * 3] = 0.3
      colors[i * 3 + 1] = 0.5
      colors[i * 3 + 2] = 1.0
    } else {
      colors[i * 3] = 1.0
      colors[i * 3 + 1] = 0.3
      colors[i * 3 + 2] = 0.3
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.attributes.color.needsUpdate = true
}

export function StlModel({ url, onAnalysisComplete, showCurvature, curvatureOpacity, annotationMode, onMeshClick, onGeometryReady, showSeparation, separationPlane }: StlModelProps) {
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
    onGeometryReady?.(geometry)
  }, [geometry])

  useEffect(() => {
    if (!analysisData || !geometry) return

    if (showSeparation && separationPlane) {
      applySeparationColors(geometry, separationPlane)
    } else if (showCurvature) {
      applyCurvatureColors(geometry, analysisData.curvature)
    } else {
      geometry.deleteAttribute('color')
    }

    geometry.attributes.position.needsUpdate = true
    if (geometry.attributes.color) {
      geometry.attributes.color.needsUpdate = true
    }
  }, [showCurvature, showSeparation, separationPlane, analysisData, geometry])

  const hasVertexColors = !!(showCurvature || (showSeparation && separationPlane)) && !!geometry.getAttribute('color')

  const handleClick = useCallback((e: THREE.Event & { point?: THREE.Vector3; stopPropagation?: () => void }) => {
    if (annotationMode && onMeshClick && e.point) {
      e.stopPropagation?.()
      onMeshClick(e.point)
    }
  }, [annotationMode, onMeshClick])

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      onClick={handleClick}
    >
      <meshStandardMaterial
        color={hasVertexColors ? '#ffffff' : '#a0c4ff'}
        metalness={0.2}
        roughness={0.6}
        side={THREE.DoubleSide}
        vertexColors={hasVertexColors}
        transparent={!!((showCurvature && (curvatureOpacity ?? 1) < 1) || (showSeparation && separationPlane))}
        opacity={showSeparation && separationPlane ? 0.9 : showCurvature ? (curvatureOpacity ?? 1) : 1}
      />
    </mesh>
  )
}
