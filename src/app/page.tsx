'use client'

import { useState, useCallback } from 'react'
import { ViewerSection } from '@/components/viewer/viewer-section'
import { Sidebar } from '@/components/layout/sidebar'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<MeshAnalysisResult | null>(null)
  const [selectedImplant, setSelectedImplant] = useState<number | null>(null)
  const [annotationCount, setAnnotationCount] = useState(0)

  const handleAnnotationSave = useCallback(() => {
    setAnnotationCount(prev => prev + 1)
  }, [])

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        analysisResult={analysisResult}
        selectedImplant={selectedImplant}
        onImplantSelect={setSelectedImplant}
        annotationCount={annotationCount}
      />
      <main className="flex-1 overflow-hidden">
        <ViewerSection
          analysisResult={analysisResult}
          onAnalysisResultChange={setAnalysisResult}
          selectedImplant={selectedImplant}
          onImplantSelect={setSelectedImplant}
          onAnnotationSave={handleAnnotationSave}
        />
      </main>
    </div>
  )
}
