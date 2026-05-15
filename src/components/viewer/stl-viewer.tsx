'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import { Suspense, useCallback, useState, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { StlModel } from './stl-model'
import { LoadingSpinner } from './loading-spinner'
import { ImplantMarker } from './implant-marker'
import { CuttingPlaneVisual } from './cutting-plane-visual'
import { CutLineVisual } from './cut-line-visual'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'
import { CuttingResult, CuttingPlane, applyPlaneParams, CutLine } from '@/lib/cutting-plane'
import { computeAllCutLines, intersectPlaneMesh } from '@/lib/mesh-intersection'
import { PlaneParams } from './viewer-section'

interface SeparationPlane {
  normal: THREE.Vector3
  point: THREE.Vector3
}

interface StlViewerProps {
  url: string
  analysisResult: MeshAnalysisResult | null
  selectedImplant: number | null
  onImplantSelect: (index: number | null) => void
  onAnalysisComplete: (result: MeshAnalysisResult) => void
  showCurvature: boolean
  curvatureOpacity: number
  annotationMode?: boolean
  onMeshClick?: (point: THREE.Vector3) => void
  cuttingResult: CuttingResult | null
  selectedPlaneId: string | null
  onPlaneSelect: (id: string | null) => void
  planeParams: Record<string, PlaneParams>
  onPlaneParamsChange?: (params: Record<string, PlaneParams>) => void
  showSeparation?: boolean
  separationPlane?: SeparationPlane | null
}

export function StlViewer({
  url, analysisResult, selectedImplant, onImplantSelect, onAnalysisComplete,
  showCurvature, curvatureOpacity, annotationMode, onMeshClick,
  cuttingResult, selectedPlaneId, onPlaneSelect, planeParams, onPlaneParamsChange,
  showSeparation, separationPlane
}: StlViewerProps) {
  const geometryRef = useRef<THREE.BufferGeometry | null>(null)
  const [liveCutLines, setLiveCutLines] = useState<CutLine[]>([])

  const handleCanvasClick = useCallback((e: THREE.Event & { point?: THREE.Vector3 }) => {
    if (annotationMode && onMeshClick && e.point) {
      onMeshClick(e.point)
    }
  }, [annotationMode, onMeshClick])

  const handleGeometryReady = useCallback((geometry: THREE.BufferGeometry) => {
    geometryRef.current = geometry
  }, [])

  const hasParams = Object.keys(planeParams).length > 0

  const computedLines = useMemo(() => {
    if (!cuttingResult || !geometryRef.current) return cuttingResult?.lines ?? []
    const geo = geometryRef.current
    return cuttingResult.planes.map(plane => {
      const params = planeParams[plane.id]
      if (!params || (params.offset === 0 && params.tiltAngle === 0)) {
        const existing = cuttingResult.lines.find(l => l.planeId === plane.id)
        if (existing) return existing
      }
      const modified: CuttingPlane = {
        ...plane,
        offset: params?.offset ?? 0,
        tiltAngle: params?.tiltAngle ?? 0,
      }
      return intersectPlaneMesh(modified, geo)
    })
  }, [cuttingResult, planeParams, hasParams])

  return (
    <Canvas
      camera={{ position: [0, 0, 100], fov: 50 }}
      gl={{ preserveDrawingBuffer: true }}
      className="bg-background"
      onPointerMissed={undefined}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[50, 50, 25]} intensity={1} castShadow />
      <directionalLight position={[-50, -50, -25]} intensity={0.3} />

      <Suspense fallback={<LoadingSpinner />}>
        <StlModel
          url={url}
          onAnalysisComplete={onAnalysisComplete}
          showCurvature={showCurvature}
          curvatureOpacity={curvatureOpacity}
          annotationMode={annotationMode}
          onMeshClick={onMeshClick}
          onGeometryReady={handleGeometryReady}
          showSeparation={showSeparation}
          separationPlane={separationPlane}
        />
      </Suspense>

      {analysisResult?.cylinderCandidates.map((cyl, i) => (
        <ImplantMarker
          key={i}
          center={cyl.center}
          axis={cyl.axis}
          radius={cyl.radius}
          confidence={cyl.confidence}
          index={i}
          isSelected={selectedImplant === i}
          onClick={() => onImplantSelect(selectedImplant === i ? null : i)}
        />
      ))}

      {cuttingResult && (
        <CuttingPlaneVisual
          cuttingResult={cuttingResult}
          selectedPlaneId={selectedPlaneId}
          onPlaneSelect={onPlaneSelect}
          planeParams={planeParams}
          onPlaneParamsChange={onPlaneParamsChange}
        />
      )}

      {cuttingResult && computedLines.length > 0 && (
        <CutLineVisual lines={computedLines} />
      )}

      <ContactShadows position={[0, -30, 0]} opacity={0.4} scale={100} blur={2} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      <gridHelper args={[200, 20, '#333', '#222']} position={[0, -30, 0]} />
    </Canvas>
  )
}
