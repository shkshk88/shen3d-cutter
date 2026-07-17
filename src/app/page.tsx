'use client'

import { useState, useCallback } from 'react'
import { ViewerSection } from '@/components/viewer/viewer-section'
import { Sidebar } from '@/components/layout/sidebar'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'
import {
  computeInsertionAxis,
  applyAxisAdjustment,
  AxisAdjustment,
  DEFAULT_AXIS_ADJUSTMENT,
} from '@/lib/screw-channels'
import { BarParams, DEFAULT_BAR_PARAMS } from '@/lib/bar-client'

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<MeshAnalysisResult | null>(null)
  const [selectedImplant, setSelectedImplant] = useState<number | null>(null)
  const [annotationCount, setAnnotationCount] = useState(0)
  const [fileName, setFileName] = useState('')
  const [stlFile, setStlFile] = useState<File | null>(null)
  const [barParams, setBarParams] = useState<BarParams>(DEFAULT_BAR_PARAMS)
  const [axisAdjust, setAxisAdjust] = useState<AxisAdjustment>(DEFAULT_AXIS_ADJUSTMENT)

  const handleAnnotationSave = useCallback(() => {
    setAnnotationCount(prev => prev + 1)
  }, [])

  const effectiveAxis = useCallback((channels: MeshAnalysisResult['channels'], adj: AxisAdjustment) => {
    const base = computeInsertionAxis(channels)
    return base ? applyAxisAdjustment(base, adj) : null
  }, [])

  const handleChannelRemove = useCallback((index: number) => {
    setAnalysisResult(prev => {
      if (!prev) return prev
      const channels = prev.channels.filter((_, i) => i !== index)
      return { ...prev, channels, insertionAxis: effectiveAxis(channels, axisAdjust) }
    })
    setSelectedImplant(null)
  }, [axisAdjust, effectiveAxis])

  const handleAxisAdjustChange = useCallback((adj: AxisAdjustment) => {
    setAxisAdjust(adj)
    setAnalysisResult(prev => {
      if (!prev) return prev
      return { ...prev, insertionAxis: effectiveAxis(prev.channels, adj) }
    })
  }, [effectiveAxis])

  const handleFileNameChange = useCallback((name: string) => {
    setFileName(name)
    setAxisAdjust(DEFAULT_AXIS_ADJUSTMENT)
  }, [])

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        analysisResult={analysisResult}
        selectedImplant={selectedImplant}
        onImplantSelect={setSelectedImplant}
        onChannelRemove={handleChannelRemove}
        annotationCount={annotationCount}
        fileName={fileName}
        barParams={barParams}
        onBarParamsChange={setBarParams}
        axisAdjustment={axisAdjust}
        onAxisAdjustmentChange={handleAxisAdjustChange}
      />
      <main className="flex-1 overflow-hidden">
        <ViewerSection
          analysisResult={analysisResult}
          onAnalysisResultChange={setAnalysisResult}
          selectedImplant={selectedImplant}
          onImplantSelect={setSelectedImplant}
          onAnnotationSave={handleAnnotationSave}
          onFileNameChange={handleFileNameChange}
          stlFile={stlFile}
          onStlFileChange={setStlFile}
          barParams={barParams}
        />
      </main>
    </div>
  )
}
