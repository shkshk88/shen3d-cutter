'use client'

import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three-stdlib'
import * as THREE from 'three'
import { useCallback, useEffect, useMemo } from 'react'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import { analyzeMesh, MeshAnalysisResult } from '@/lib/mesh-analysis'
import { applyCurvatureColors } from './curvature-visualization'

// Raycast accelerato via BVH su tutte le mesh (mesh dentali: 100k-1M triangoli)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

interface StlModelProps {
  url: string
  onAnalysisComplete?: (result: MeshAnalysisResult) => void
  showCurvature?: boolean
  curvatureOpacity?: number
  annotationMode?: boolean
  onMeshClick?: (point: THREE.Vector3) => void
  onGeometryReady?: (geometry: THREE.BufferGeometry) => void
}

export function StlModel({ url, onAnalysisComplete, showCurvature, curvatureOpacity, annotationMode, onMeshClick, onGeometryReady }: StlModelProps) {
  const geometry = useLoader(STLLoader, url)

  // Analisi derivata dalla geometria caricata. Le mutazioni (normali, BVH)
  // sono l'API imperativa di three.js: inevitabili e idempotenti.
  const analysisData = useMemo<MeshAnalysisResult | null>(() => {
    if (!geometry) return null
    // I vertici restano nelle coordinate originali del file STL (millimetri).
    // La vista viene adattata dalla camera (<Bounds> in stl-viewer), NON scalando
    // la geometria: i parametri clinici (gap cemento in µm, raggi canali) devono
    // arrivare al backend in mm reali.
     
    geometry.computeBoundingBox()
     
    geometry.computeVertexNormals()
     
    geometry.computeBoundsTree()
    return analyzeMesh(geometry)
  }, [geometry])

  useEffect(() => {
    if (!geometry || !analysisData) return
    onAnalysisComplete?.(analysisData)
    onGeometryReady?.(geometry)
    return () => {
      geometry.disposeBoundsTree()
    }
    // Le callback dei parent cambiano identità a ogni render: rieseguire
    // l'effetto solo quando cambia la geometria analizzata
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, analysisData])

  useEffect(() => {
    if (!analysisData || !geometry) return

    if (showCurvature) {
      applyCurvatureColors(geometry, analysisData.curvature)
    } else {
      geometry.deleteAttribute('color')
    }

    // Mutazione imperativa three.js: segnala alla GPU i buffer aggiornati
    // eslint-disable-next-line react-hooks/immutability
    geometry.attributes.position.needsUpdate = true
    if (geometry.attributes.color) {
       
      geometry.attributes.color.needsUpdate = true
    }
  }, [showCurvature, analysisData, geometry])

  const hasVertexColors = !!showCurvature && !!geometry.getAttribute('color')

  const handleClick = useCallback((e: THREE.Event & { point?: THREE.Vector3; stopPropagation?: () => void }) => {
    if (annotationMode && onMeshClick && e.point) {
      e.stopPropagation?.()
      onMeshClick(e.point)
    }
  }, [annotationMode, onMeshClick])

  return (
    <mesh
      geometry={geometry}
      onClick={handleClick}
    >
      <meshStandardMaterial
        color={hasVertexColors ? '#ffffff' : '#a0c4ff'}
        metalness={0.2}
        roughness={0.6}
        side={THREE.DoubleSide}
        vertexColors={hasVertexColors}
        transparent={!!(showCurvature && (curvatureOpacity ?? 1) < 1)}
        opacity={showCurvature ? (curvatureOpacity ?? 1) : 1}
      />
    </mesh>
  )
}
