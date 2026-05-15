'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'
import { computeCuttingResult, CuttingResult, applyPlaneParams, CuttingPlane } from '@/lib/cutting-plane'
import { computeAllCutLines } from '@/lib/mesh-intersection'
import { useAnnotationTool } from './annotation-tool'
import * as THREE from 'three'

export interface PlaneParams {
  offset: number
  tiltAngle: number
}

const StlViewer = dynamic(
  () => import('./stl-viewer').then(mod => ({ default: mod.StlViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
)

const AnnotationPoints = dynamic(
  () => import('./annotation-points').then(mod => ({ default: mod.AnnotationPoints })),
  { ssr: false }
)

interface ViewerSectionProps {
  analysisResult: MeshAnalysisResult | null
  onAnalysisResultChange: (result: MeshAnalysisResult | null) => void
  selectedImplant: number | null
  onImplantSelect: (index: number | null) => void
  onAnnotationSave?: () => void
  cuttingResult: CuttingResult | null
  onCuttingResultChange: (result: CuttingResult | null) => void
  selectedPlaneId: string | null
  onPlaneSelect: (id: string | null) => void
  planeParams: Record<string, PlaneParams>
  onPlaneParamsChange: (params: Record<string, PlaneParams>) => void
  onFileNameChange?: (name: string) => void
}

export function ViewerSection({ analysisResult, onAnalysisResultChange, selectedImplant, onImplantSelect, onAnnotationSave, cuttingResult, onCuttingResultChange, selectedPlaneId, onPlaneSelect, planeParams, onPlaneParamsChange, onFileNameChange }: ViewerSectionProps) {
  const [stlUrl, setStlUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [showCurvature, setShowCurvature] = useState(false)
  const [curvatureOpacity, setCurvatureOpacity] = useState(0.7)
  const [annotationMode, setAnnotationMode] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showCuttingPlanes, setShowCuttingPlanes] = useState(true)
  const [showSeparation, setShowSeparation] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const annotationTool = useAnnotationTool()

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'stl') {
      alert('Seleziona un file .stl')
      return
    }
    const url = URL.createObjectURL(file)
    setStlUrl(url)
    setFileName(file.name)
    onFileNameChange?.(file.name)
    onAnalysisResultChange(null)
    onImplantSelect(null)
    setShowCurvature(false)
    setAnnotationMode(false)
    setIsAnalyzing(true)
    onCuttingResultChange(null)
  }, [onAnalysisResultChange, onImplantSelect, onFileNameChange])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleAnalysisComplete = useCallback((result: MeshAnalysisResult) => {
    onAnalysisResultChange(result)
    setIsAnalyzing(false)
    const cutting = computeCuttingResult(result)
    onCuttingResultChange(cutting)
  }, [onAnalysisResultChange, onCuttingResultChange])

  const handleMeshClick = useCallback((point: THREE.Vector3) => {
    if (annotationMode) {
      annotationTool.addPoint(point)
    }
  }, [annotationMode, annotationTool])

  const handleSaveAnnotation = useCallback(() => {
    if (!fileName) return
    const result = annotationTool.save(
      fileName,
      analysisResult?.cylinderCandidates.length ?? 0
    )
    if (result) {
      onAnnotationSave?.()
    }
  }, [annotationTool, fileName, analysisResult, onAnnotationSave])

  const currentPlaneParams = selectedPlaneId ? (planeParams[selectedPlaneId] ?? { offset: 0, tiltAngle: 0 }) : { offset: 0, tiltAngle: 0 }

  const updatePlaneParam = useCallback((key: 'offset' | 'tiltAngle', value: number) => {
    if (!selectedPlaneId) return
    onPlaneParamsChange({
      ...planeParams,
      [selectedPlaneId]: {
        ...(planeParams[selectedPlaneId] ?? { offset: 0, tiltAngle: 0 }),
        [key]: value,
      },
    })
  }, [selectedPlaneId, planeParams, onPlaneParamsChange])

  const resetPlaneParams = useCallback(() => {
    if (!selectedPlaneId) return
    onPlaneParamsChange({
      ...planeParams,
      [selectedPlaneId]: { offset: 0, tiltAngle: 0 },
    })
  }, [selectedPlaneId, planeParams, onPlaneParamsChange])

  const separationPlane = useMemo(() => {
    if (!selectedPlaneId || !cuttingResult || !showSeparation) return null
    const plane = cuttingResult.planes.find(p => p.id === selectedPlaneId)
    if (!plane) return null
    const params = planeParams[selectedPlaneId] ?? { offset: 0, tiltAngle: 0 }
    const modified: CuttingPlane = {
      ...plane,
      offset: params.offset,
      tiltAngle: params.tiltAngle,
    }
    const { effectiveNormal, effectivePoint } = applyPlaneParams(modified)
    return { normal: effectiveNormal, point: effectivePoint }
  }, [selectedPlaneId, cuttingResult, showSeparation, planeParams])

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar — visible only after file loaded */}
      {stlUrl && (
        <div className="h-12 border-b flex items-center px-4 gap-4 bg-card overflow-x-auto">
          <span className="text-sm font-medium whitespace-nowrap">{fileName}</span>
          <Button variant="outline" size="sm" onClick={() => { setStlUrl(null); setFileName(''); onAnalysisResultChange(null) }}>
            Nuovo file
          </Button>

          <Button
            variant={showCurvature ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowCurvature(!showCurvature)}
          >
            Curvatura
          </Button>

          {showCurvature && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Opacità</span>
              <Slider
                min={0} max={100} defaultValue={[70]}
                onValueChange={(v) => setCurvatureOpacity((Array.isArray(v) ? v[0] : v as number) / 100)}
                className="w-24"
              />
            </div>
          )}

          <Button
            variant={annotationMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAnnotationMode(!annotationMode)}
          >
            Annota {annotationTool.state.points.length > 0 ? `(${annotationTool.state.points.length})` : ''}
          </Button>

          {annotationMode && (
            <>
              <Button variant="outline" size="xs" onClick={annotationTool.undoPoint} disabled={annotationTool.state.points.length === 0}>
                Undo
              </Button>
              <Button variant="outline" size="xs" onClick={annotationTool.clearPoints} disabled={annotationTool.state.points.length === 0}>
                Clear
              </Button>
              <Button variant="default" size="xs" onClick={handleSaveAnnotation} disabled={!annotationTool.canSave}>
                Salva
              </Button>
            </>
          )}

          {analysisResult && (
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant={showCuttingPlanes ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowCuttingPlanes(!showCuttingPlanes)}
              >
                Taglio
              </Button>
              <span className="text-xs text-muted-foreground">
                {analysisResult.cylinderCandidates.length} impianto/i
              </span>
              {selectedPlaneId && (
                <div className="flex items-center gap-3 border-l pl-3 ml-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Offset</span>
                    <Slider
                      min={-10} max={10} step={0.5}
                      value={[currentPlaneParams.offset]}
                      onValueChange={(v) => updatePlaneParam('offset', Array.isArray(v) ? v[0] : v as number)}
                      className="w-24"
                    />
                    <span className="text-xs w-12 text-right">{currentPlaneParams.offset > 0 ? '+' : ''}{currentPlaneParams.offset.toFixed(1)}mm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Tilt</span>
                    <Slider
                      min={-30} max={30} step={1}
                      value={[currentPlaneParams.tiltAngle]}
                      onValueChange={(v) => updatePlaneParam('tiltAngle', Array.isArray(v) ? v[0] : v as number)}
                      className="w-24"
                    />
                    <span className="text-xs w-10 text-right">{currentPlaneParams.tiltAngle > 0 ? '+' : ''}{currentPlaneParams.tiltAngle}°</span>
                  </div>
                  <Button variant="outline" size="xs" onClick={resetPlaneParams}>
                    Reset
                  </Button>
                  <Button
                    variant={showSeparation ? 'default' : 'outline'}
                    size="xs"
                    onClick={() => setShowSeparation(!showSeparation)}
                  >
                    Separa
                  </Button>
                </div>
              )}
              {analysisResult.cylinderCandidates.map((_, i) => (
                <Button
                  key={i}
                  variant={selectedImplant === i ? 'default' : 'outline'}
                  size="xs"
                  onClick={() => onImplantSelect(selectedImplant === i ? null : i)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="flex-1 relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {stlUrl ? (
          <StlViewer
            url={stlUrl}
            analysisResult={analysisResult}
            selectedImplant={selectedImplant}
            onImplantSelect={onImplantSelect}
            onAnalysisComplete={handleAnalysisComplete}
            showCurvature={showCurvature}
            curvatureOpacity={curvatureOpacity}
            annotationMode={annotationMode}
            onMeshClick={handleMeshClick}
            cuttingResult={showCuttingPlanes ? cuttingResult : null}
            selectedPlaneId={selectedPlaneId}
            onPlaneSelect={onPlaneSelect}
            planeParams={planeParams}
            onPlaneParamsChange={onPlaneParamsChange}
            showSeparation={showSeparation}
            separationPlane={separationPlane}
          />
        ) : (
          /* BIG upload area — the input IS the button */
          <div className="h-full flex items-center justify-center p-6">
            <div className="w-full max-w-sm text-center">
              <div className="text-6xl mb-6">🦷</div>
              <h2 className="text-xl font-semibold mb-2">Shen3D Cutter</h2>
              <p className="text-sm text-muted-foreground mb-8">Carica un file STL per analizzare il ponte dentale</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 px-6 rounded-xl bg-primary text-primary-foreground text-lg font-semibold shadow-lg hover:opacity-90 active:scale-95 transition-all"
              >
                📂 Carica file STL
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground mt-4">oppure trascina il file qui</p>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {isAnalyzing && (
          <div className="absolute top-4 right-4 bg-card border rounded-lg p-3 shadow-lg z-10">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Analisi in corso...</span>
            </div>
          </div>
        )}

        {/* Annotation points overlay */}
        {annotationMode && stlUrl && annotationTool.state.points.length > 0 && (
          <AnnotationPoints points={annotationTool.state.points} />
        )}
      </div>
    </div>
  )
}
