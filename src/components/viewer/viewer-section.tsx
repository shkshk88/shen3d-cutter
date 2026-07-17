'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'
import { computeCuttingResult, CuttingResult, applyPlaneParams, CuttingPlane } from '@/lib/cutting-plane'
import { fitChannelFromSeed, computeInsertionAxis } from '@/lib/screw-channels'
import { proposeSplitCurve, saveCurveToStorage, loadCurveFromStorage } from '@/lib/split-curve'
import { useSplitCurveTool } from './split-curve-tool'
import { useAnnotationTool } from './annotation-tool'
import { uploadStlToServer, splitStl, SplitResult } from '@/lib/cutter-client'
import { SplitResultDialog } from './split-result-dialog'
import { startSplitBarJob, pollJobUntilDone, JobStatus, DEFAULT_BAR_PARAMS } from '@/lib/bar-client'
import { BarResultDialog } from './bar-result-dialog'
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
  stlFile?: File | null
  onStlFileChange?: (file: File | null) => void
}

export function ViewerSection({ analysisResult, onAnalysisResultChange, selectedImplant, onImplantSelect, onAnnotationSave, cuttingResult, onCuttingResultChange, selectedPlaneId, onPlaneSelect, planeParams, onPlaneParamsChange, onFileNameChange, stlFile, onStlFileChange }: ViewerSectionProps) {
  const [stlUrl, setStlUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [showCurvature, setShowCurvature] = useState(false)
  const [curvatureOpacity, setCurvatureOpacity] = useState(0.7)
  const [annotationMode, setAnnotationMode] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showCuttingPlanes, setShowCuttingPlanes] = useState(true)
  const [showSeparation, setShowSeparation] = useState(false)
  const [isCutting, setIsCutting] = useState(false)
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null)
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const [channelAddMode, setChannelAddMode] = useState(false)
  const [curveMode, setCurveMode] = useState(false)
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [barJob, setBarJob] = useState<JobStatus | null>(null)
  const [barJobRunning, setBarJobRunning] = useState(false)
  const [barDialogOpen, setBarDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const annotationTool = useAnnotationTool()
  const curveTool = useSplitCurveTool({
    geometry,
    channels: analysisResult?.channels ?? [],
    insertionAxis: analysisResult?.insertionAxis ?? null,
  })

  // Persistenza della curva per file (localStorage)
  useEffect(() => {
    if (!fileName || curveTool.curve.controlPoints.length === 0) return
    saveCurveToStorage(fileName, curveTool.curve)
  }, [fileName, curveTool.curve])

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
    setSplitResult(null)
    setCurveMode(false)
    setChannelAddMode(false)
    setGeometry(null)
    curveTool.clear()
    onStlFileChange?.(file)
  }, [onAnalysisResultChange, onImplantSelect, onFileNameChange, onStlFileChange, curveTool])

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
    // Ripristina la curva di split salvata per questo file, se esiste
    const stored = fileName ? loadCurveFromStorage(fileName) : null
    if (stored && stored.controlPoints.length > 0) {
      curveTool.setCurve(stored)
    }
  }, [onAnalysisResultChange, onCuttingResultChange, fileName, curveTool])

  const handleMeshClick = useCallback((point: THREE.Vector3) => {
    if (curveMode) {
      // Click vicino al primo punto → chiude il loop
      if (
        curveTool.canClose &&
        curveTool.curve.controlPoints.length >= 3 &&
        point.distanceTo(curveTool.curve.controlPoints[0]) < 1.5
      ) {
        curveTool.closeLoop()
      } else if (!curveTool.curve.closed) {
        curveTool.addPoint(point)
      }
      return
    }
    if (channelAddMode) {
      if (!geometry || !analysisResult) return
      const channel = fitChannelFromSeed(geometry, analysisResult.graph, point)
      if (channel) {
        const channels = [...analysisResult.channels, channel]
        onAnalysisResultChange({
          ...analysisResult,
          channels,
          insertionAxis: computeInsertionAxis(channels),
        })
        setChannelAddMode(false)
      } else {
        alert('Nessun camino trovato vicino al punto cliccato — clicca dentro o vicino al canale')
      }
      return
    }
    if (annotationMode) {
      annotationTool.addPoint(point)
    }
  }, [curveMode, curveTool, channelAddMode, annotationMode, annotationTool, geometry, analysisResult, onAnalysisResultChange])

  const handleGenerateSplit = useCallback(async () => {
    if (!stlFile || !analysisResult?.insertionAxis) return
    if (!curveTool.curve.closed || !curveTool.validation.valid) return

    setBarJobRunning(true)
    setBarJob(null)
    try {
      const upload = await uploadStlToServer(stlFile)
      const jobId = await startSplitBarJob({
        stlPath: upload.stl_path,
        curvePoints: curveTool.densified,
        insertionAxis: analysisResult.insertionAxis,
        channels: analysisResult.channels,
        params: DEFAULT_BAR_PARAMS,
      })
      const final = await pollJobUntilDone(jobId, setBarJob)
      setBarJob(final)
      setBarDialogOpen(true)
    } catch (err) {
      setBarJob({
        job_id: '',
        status: 'error',
        stage: null,
        failed_stage: null,
        error: err instanceof Error ? err.message : 'Errore sconosciuto',
      })
      setBarDialogOpen(true)
    } finally {
      setBarJobRunning(false)
    }
  }, [stlFile, analysisResult, curveTool.curve, curveTool.densified, curveTool.validation])

  const handleProposeCurve = useCallback(() => {
    if (!analysisResult) return
    const proposed = proposeSplitCurve({
      graph: analysisResult.graph,
      channels: analysisResult.channels,
      insertionAxis: analysisResult.insertionAxis,
      geometry,
    })
    if (proposed) {
      curveTool.setCurve(proposed)
    } else {
      alert('Impossibile proporre una curva: silhouette non trovata a quella quota')
    }
  }, [analysisResult, geometry, curveTool])

  const handleSaveAnnotation = useCallback(() => {
    if (!fileName) return
    const result = annotationTool.save(
      fileName,
      analysisResult?.channels.length ?? 0
    )
    if (result) {
      onAnnotationSave?.()
    }
  }, [annotationTool, fileName, analysisResult, onAnnotationSave])

  const handleCut = useCallback(async () => {
    if (!stlFile || !selectedPlaneId || !cuttingResult) return
    const plane = cuttingResult.planes.find(p => p.id === selectedPlaneId)
    if (!plane) return

    const params = planeParams[selectedPlaneId] ?? { offset: 0, tiltAngle: 0 }
    const modified: CuttingPlane = { ...plane, offset: params.offset, tiltAngle: params.tiltAngle }
    const { effectiveNormal, effectivePoint } = applyPlaneParams(modified)

    setIsCutting(true)
    setSplitResult(null)

    try {
      const uploadResult = await uploadStlToServer(stlFile)
      const result = await splitStl(
        uploadResult.stl_path,
        [effectiveNormal.x, effectiveNormal.y, effectiveNormal.z],
        [effectivePoint.x, effectivePoint.y, effectivePoint.z]
      )
      setSplitResult(result)
      setSplitDialogOpen(true)
    } catch (err) {
      setSplitResult({ engine: 'trimesh', error: err instanceof Error ? err.message : 'Errore sconosciuto' })
      setSplitDialogOpen(true)
    } finally {
      setIsCutting(false)
    }
  }, [stlFile, selectedPlaneId, cuttingResult, planeParams])

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
                variant={channelAddMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setChannelAddMode(!channelAddMode); if (!channelAddMode) { setAnnotationMode(false); setCurveMode(false) } }}
                title="Clicca dentro un camino vite non rilevato per aggiungerlo"
              >
                + Canale
              </Button>
              <Button
                variant={curveMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setCurveMode(!curveMode); if (!curveMode) { setAnnotationMode(false); setChannelAddMode(false) } }}
                title="Disegna la curva di split sulla superficie"
              >
                Curva {curveTool.curve.controlPoints.length > 0 ? `(${curveTool.curve.controlPoints.length})` : ''}
              </Button>
              {curveMode && (
                <div className="flex items-center gap-1 border-l pl-2">
                  <Button variant="outline" size="xs" onClick={handleProposeCurve} title="Curva proposta automaticamente dalla silhouette">
                    ✨ Proponi
                  </Button>
                  <Button variant="outline" size="xs" onClick={curveTool.closeLoop} disabled={!curveTool.canClose}>
                    Chiudi loop
                  </Button>
                  <Button variant="outline" size="xs" onClick={curveTool.undo} disabled={!curveTool.canUndo}>
                    Undo
                  </Button>
                  <Button variant="outline" size="xs" onClick={curveTool.clear} disabled={curveTool.curve.controlPoints.length === 0}>
                    Clear
                  </Button>
                  {curveTool.curve.closed && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${curveTool.validation.valid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                      title={curveTool.validation.errors.join(' · ')}
                    >
                      {curveTool.validation.valid ? '✓ valida' : '✗ ' + curveTool.validation.errors[0]}
                    </span>
                  )}
                  {curveTool.curve.closed && curveTool.validation.valid && (
                    <Button
                      variant="default"
                      size="xs"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleGenerateSplit}
                      disabled={barJobRunning || !stlFile}
                    >
                      {barJobRunning ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-1" />
                          {barJob?.status === 'running' ? `Stage ${barJob.stage ?? '…'}` : 'Genero…'}
                        </>
                      ) : (
                        '⚙ Genera split'
                      )}
                    </Button>
                  )}
                </div>
              )}
              <Button
                variant={showCuttingPlanes ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowCuttingPlanes(!showCuttingPlanes)}
              >
                Taglio
              </Button>
              <span className="text-xs text-muted-foreground">
                {analysisResult.channels.length} canale/i
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
                  <Button
                    variant="default"
                    size="xs"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleCut}
                    disabled={isCutting}
                  >
                    {isCutting ? (
                      <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-1" />Taglio...</>
                    ) : (
                      '✂ Taglia'
                    )}
                  </Button>
                </div>
              )}
              {analysisResult.channels.map((_, i) => (
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
            annotationMode={annotationMode || channelAddMode || curveMode}
            onMeshClick={handleMeshClick}
            onGeometryReady={setGeometry}
            splitCurveTool={curveTool}
            curveEditMode={curveMode}
            modelGeometry={geometry}
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

        {/* Cutting result dialog */}
        <SplitResultDialog
          open={splitDialogOpen}
          onOpenChange={setSplitDialogOpen}
          result={splitResult}
        />

        {/* Bar split result dialog */}
        <BarResultDialog
          open={barDialogOpen}
          onOpenChange={setBarDialogOpen}
          job={barJob}
        />
      </div>
    </div>
  )
}
