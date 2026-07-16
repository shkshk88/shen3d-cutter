'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Bounds } from '@react-three/drei'
import { Suspense, useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { StlModel } from './stl-model'
import { LoadingSpinner } from './loading-spinner'
import { ImplantMarker } from './implant-marker'
import { InsertionAxisWidget } from './insertion-axis-widget'
import { CuttingPlaneVisual } from './cutting-plane-visual'
import { CutLineVisual } from './cut-line-visual'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'
import { CuttingResult, CuttingPlane } from '@/lib/cutting-plane'
import { intersectPlaneMesh } from '@/lib/mesh-intersection'
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
  onGeometryReady?: (geometry: THREE.BufferGeometry) => void
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
  showCurvature, curvatureOpacity, annotationMode, onMeshClick, onGeometryReady,
  cuttingResult, selectedPlaneId, onPlaneSelect, planeParams, onPlaneParamsChange,
  showSeparation, separationPlane
}: StlViewerProps) {
  const geometryRef = useRef<THREE.BufferGeometry | null>(null)

  const handleGeometryReady = useCallback((geometry: THREE.BufferGeometry) => {
    geometryRef.current = geometry
    onGeometryReady?.(geometry)
  }, [onGeometryReady])

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

  // Scena in mm reali: griglia e ombre si posizionano sotto il bounding box
  // del modello (la geometria non viene più centrata/scalata)
  const sceneFrame = useMemo(() => {
    const box = analysisResult?.boundingBox
    if (!box) return null
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    return {
      groundY: box.min.y - maxDim * 0.05,
      centerX: center.x,
      centerZ: center.z,
      extent: maxDim,
    }
  }, [analysisResult])

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
        <Bounds fit clip observe margin={1.3}>
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
        </Bounds>
      </Suspense>

      {analysisResult?.insertionAxis && analysisResult.channels.length > 0 && (
        <InsertionAxisWidget
          axis={analysisResult.insertionAxis}
          boundingBox={analysisResult.boundingBox}
        />
      )}

      {analysisResult?.channels.map((channel, i) => (
        <ImplantMarker
          key={channel.id}
          center={channel.center}
          axis={channel.axis}
          radius={channel.radius}
          height={channel.height}
          confidence={channel.confidence}
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

      {sceneFrame && (
        <>
          <ContactShadows
            position={[sceneFrame.centerX, sceneFrame.groundY, sceneFrame.centerZ]}
            opacity={0.4}
            scale={sceneFrame.extent * 2}
            blur={2}
          />
          <gridHelper
            args={[sceneFrame.extent * 3, 24, '#333', '#222']}
            position={[sceneFrame.centerX, sceneFrame.groundY, sceneFrame.centerZ]}
          />
        </>
      )}
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
    </Canvas>
  )
}
