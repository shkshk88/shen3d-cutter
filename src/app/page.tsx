'use client'

import { useState } from 'react'
import { ViewerSection } from '@/components/viewer/viewer-section'
import { Sidebar } from '@/components/layout/sidebar'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<MeshAnalysisResult | null>(null)
  const [selectedImplant, setSelectedImplant] = useState<number | null>(null)

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        analysisResult={analysisResult}
        selectedImplant={selectedImplant}
        onImplantSelect={setSelectedImplant}
      />
      <main className="flex-1 overflow-hidden">
        <ViewerSection
          analysisResult={analysisResult}
          onAnalysisResultChange={setAnalysisResult}
          selectedImplant={selectedImplant}
          onImplantSelect={setSelectedImplant}
        />
      </main>
    </div>
  )
}
