'use client'

import { useState, useCallback } from 'react'
import { ViewerSection, PlaneParams } from '@/components/viewer/viewer-section'
import { Sidebar } from '@/components/layout/sidebar'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'
import { CuttingResult } from '@/lib/cutting-plane'

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<MeshAnalysisResult | null>(null)
  const [selectedImplant, setSelectedImplant] = useState<number | null>(null)
  const [annotationCount, setAnnotationCount] = useState(0)
  const [cuttingResult, setCuttingResult] = useState<CuttingResult | null>(null)
  const [selectedPlaneId, setSelectedPlaneId] = useState<string | null>(null)
  const [planeParams, setPlaneParams] = useState<Record<string, PlaneParams>>({})
  const [fileName, setFileName] = useState('')

  const handleAnnotationSave = useCallback(() => {
    setAnnotationCount(prev => prev + 1)
  }, [])

  const handleCuttingResultChange = useCallback((result: CuttingResult | null) => {
    setCuttingResult(result)
    if (!result) {
      setSelectedPlaneId(null)
      setPlaneParams({})
    }
  }, [])

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        analysisResult={analysisResult}
        selectedImplant={selectedImplant}
        onImplantSelect={setSelectedImplant}
        annotationCount={annotationCount}
        cuttingResult={cuttingResult}
        selectedPlaneId={selectedPlaneId}
        onPlaneSelect={setSelectedPlaneId}
        fileName={fileName}
        planeParams={planeParams}
      />
      <main className="flex-1 overflow-hidden">
        <ViewerSection
          analysisResult={analysisResult}
          onAnalysisResultChange={setAnalysisResult}
          selectedImplant={selectedImplant}
          onImplantSelect={setSelectedImplant}
          onAnnotationSave={handleAnnotationSave}
          cuttingResult={cuttingResult}
          onCuttingResultChange={handleCuttingResultChange}
          selectedPlaneId={selectedPlaneId}
          onPlaneSelect={setSelectedPlaneId}
          planeParams={planeParams}
          onPlaneParamsChange={setPlaneParams}
          onFileNameChange={setFileName}
        />
      </main>
    </div>
  )
}
