'use client'

import { Separator } from '@/components/ui/separator'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'
import * as THREE from 'three'

interface SidebarProps {
  analysisResult?: MeshAnalysisResult | null
  selectedImplant?: number | null
  onImplantSelect?: (index: number | null) => void
  annotationCount?: number
}

export function Sidebar({ analysisResult, selectedImplant, onImplantSelect, annotationCount = 0 }: SidebarProps) {
  const size = analysisResult?.boundingBox
    ? new THREE.Vector3()
    : null
  if (analysisResult?.boundingBox) {
    analysisResult.boundingBox.getSize(size!)
  }

  return (
    <aside className="w-64 border-r bg-card flex flex-col h-full">
      <div className="p-4">
        <h1 className="text-xl font-bold text-primary">Shen3D</h1>
        <p className="text-xs text-muted-foreground">Cutter Parametrico AI</p>
      </div>
      <Separator />

      {/* Impianti rilevati */}
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">IMPIANTI RILEVATI</p>
        {analysisResult ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {analysisResult.cylinderCandidates.length} impianto/i rilevato/i
            </p>
            {analysisResult.cylinderCandidates.map((cyl, i) => (
              <div
                key={i}
                className={`p-2 rounded text-xs cursor-pointer
                  ${selectedImplant === i ? 'bg-amber-500/20 border border-amber-500' : 'bg-muted'}`}
                onClick={() => onImplantSelect?.(selectedImplant === i ? null : i)}
              >
                <p className="font-medium">Impianto {i + 1}</p>
                <p>Raggio: {cyl.radius.toFixed(1)}mm</p>
                <p>Confidenza: {(cyl.confidence * 100).toFixed(0)}%</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun modello caricato</p>
        )}
      </div>
      <Separator />

      {/* Proprietà modello */}
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">PROPRIETÀ</p>
        {analysisResult ? (
          <div className="space-y-1 text-xs">
            <p>Vertici: {analysisResult.vertexCount.toLocaleString()}</p>
            <p>Facce: {analysisResult.faceCount.toLocaleString()}</p>
            <p>Feature: {analysisResult.highCurvatureIndices.length.toLocaleString()}</p>
            <p>Impianti: {analysisResult.cylinderCandidates.length}</p>
            <p>Annotazioni: {annotationCount}</p>
            {size && (
              <>
                <Separator className="my-2" />
                <p className="font-medium">DIMENSIONI</p>
                <p>L: {size.x.toFixed(1)}mm</p>
                <p>A: {size.y.toFixed(1)}mm</p>
                <p>P: {size.z.toFixed(1)}mm</p>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Carica un STL per iniziare</p>
        )}
      </div>

      {/* Legenda curvatura */}
      <div className="mt-auto p-4 border-t">
        <p className="text-sm font-medium text-muted-foreground mb-2">LEGENDA CURVATURA</p>
        <div className="h-3 w-full rounded-full" style={{
          background: 'linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)'
        }} />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Bassa</span>
          <span>Alta</span>
        </div>
      </div>
    </aside>
  )
}
