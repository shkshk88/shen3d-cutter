'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'
import { useAnnotationTool } from './annotation-tool'
import * as THREE from 'three'

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
}

export function ViewerSection({ analysisResult, onAnalysisResultChange, selectedImplant, onImplantSelect, onAnnotationSave }: ViewerSectionProps) {
  const [stlUrl, setStlUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [showCurvature, setShowCurvature] = useState(false)
  const [curvatureOpacity, setCurvatureOpacity] = useState(0.7)
  const [annotationMode, setAnnotationMode] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const annotationTool = useAnnotationTool()

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'stl') {
      alert('Seleziona un file .stl')
      e.target.value = ''
      return
    }
    const url = URL.createObjectURL(file)
    setStlUrl(url)
    setFileName(file.name)
    onAnalysisResultChange(null)
    onImplantSelect(null)
    setShowCurvature(false)
    setAnnotationMode(false)
    setIsAnalyzing(true)
  }, [onAnalysisResultChange, onImplantSelect])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setStlUrl(url)
    setFileName(file.name)
    onAnalysisResultChange(null)
    onImplantSelect(null)
    setShowCurvature(false)
    setAnnotationMode(false)
    setIsAnalyzing(true)
  }, [onAnalysisResultChange, onImplantSelect])

  const handleAnalysisComplete = useCallback((result: MeshAnalysisResult) => {
    onAnalysisResultChange(result)
    setIsAnalyzing(false)
  }, [onAnalysisResultChange])

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

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-12 border-b flex items-center px-4 gap-4 bg-card overflow-x-auto">
        <span className="text-sm font-medium whitespace-nowrap">{fileName || 'Nessun file caricato'}</span>
        <label className="cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3">
          Carica STL
          <input id="stl-upload" type="file" onChange={handleFileUpload} className="sr-only" />
        </label>

        {stlUrl && (
          <>
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
          </>
        )}

        {analysisResult && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">
              {analysisResult.cylinderCandidates.length} impianto/i
            </span>
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
          />
        ) : (
          <div className="h-full flex items-center justify-center border-2 border-dashed rounded-lg m-4">
            <div className="text-center">
              <p className="text-lg text-muted-foreground">Trascina qui un file STL</p>
              <p className="text-sm text-muted-foreground mt-2">oppure clicca &quot;Carica STL&quot;</p>
            </div>
          </div>
        )}

        {/* Loading overlay per analisi */}
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
