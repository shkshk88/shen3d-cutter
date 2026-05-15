'use client'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { downloadAnnotations } from '@/lib/export-annotations'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'
import { CuttingResult, CuttingPlane } from '@/lib/cutting-plane'
import * as THREE from 'three'

interface SidebarProps {
  analysisResult?: MeshAnalysisResult | null
  selectedImplant?: number | null
  onImplantSelect?: (index: number | null) => void
  annotationCount?: number
  cuttingResult?: CuttingResult | null
  selectedPlaneId?: string | null
  onPlaneSelect?: (id: string | null) => void
}

function PlaneCard({ plane, selected, onClick }: {
  plane: CuttingPlane
  selected: boolean
  onClick: () => void
}) {
  const color = plane.method === 'junction' ? '#f59e0b' : '#10b981'
  const methodLabel = plane.method === 'junction' ? 'Giunzione' :
                      plane.method === 'midpoint' ? 'Punto medio' : 'Curvatura'
  const confidencePct = Math.round(plane.confidence * 100)

  return (
    <div
      className={`p-2 rounded text-xs cursor-pointer ${selected ? 'bg-amber-500/20 border border-amber-500' : 'bg-muted'}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-medium">{methodLabel}</span>
        <span className="ml-auto text-muted-foreground">{plane.implantIndices.map(i => i + 1).join(', ')}</span>
      </div>
      <div className="w-full bg-muted-foreground/20 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full"
          style={{ width: `${confidencePct}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">Confidenza: {confidencePct}%</p>
      {selected && (
        <div className="mt-1 text-[10px] text-muted-foreground space-y-0.5">
          <p>Pos: ({plane.point.x.toFixed(1)}, {plane.point.y.toFixed(1)}, {plane.point.z.toFixed(1)})</p>
          <p>Norm: ({plane.normal.x.toFixed(2)}, {plane.normal.y.toFixed(2)}, {plane.normal.z.toFixed(2)})</p>
        </div>
      )}
    </div>
  )
}

export function Sidebar({ analysisResult, selectedImplant, onImplantSelect, annotationCount = 0, cuttingResult, selectedPlaneId, onPlaneSelect }: SidebarProps) {
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

      {/* Piani di Taglio */}
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">PIANI DI TAGLIO</p>
        {cuttingResult && cuttingResult.planes.length > 0 ? (
          <div className="space-y-2">
            {cuttingResult.planes.map((plane) => (
              <PlaneCard
                key={plane.id}
                plane={plane}
                selected={plane.id === selectedPlaneId}
                onClick={() => onPlaneSelect?.(plane.id === selectedPlaneId ? null : plane.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun piano generato</p>
        )}
      </div>
      <Separator />

      {/* Export annotazioni */}
      <div className="p-4 border-t">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={downloadAnnotations}
          disabled={annotationCount === 0}
        >
          Export Annotazioni ({annotationCount})
        </Button>
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
