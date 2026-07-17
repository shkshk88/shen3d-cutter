'use client'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { downloadAnnotations } from '@/lib/export-annotations'
import { MeshAnalysisResult } from '@/lib/mesh-analysis'
import { AxisAdjustment } from '@/lib/screw-channels'
import { BarParams } from '@/lib/bar-client'
import { ParamsPanel } from './params-panel'
import { InsertionAxisControls } from './insertion-axis-controls'
import * as THREE from 'three'

interface SidebarProps {
  analysisResult?: MeshAnalysisResult | null
  selectedImplant?: number | null
  onImplantSelect?: (index: number | null) => void
  onChannelRemove?: (index: number) => void
  annotationCount?: number
  fileName?: string
  barParams: BarParams
  onBarParamsChange: (params: BarParams) => void
  axisAdjustment?: AxisAdjustment
  onAxisAdjustmentChange?: (adjustment: AxisAdjustment) => void
}

export function Sidebar({
  analysisResult, selectedImplant, onImplantSelect, onChannelRemove,
  annotationCount = 0, barParams, onBarParamsChange,
  axisAdjustment, onAxisAdjustmentChange,
}: SidebarProps) {
  const size = analysisResult?.boundingBox
    ? new THREE.Vector3()
    : null
  if (analysisResult?.boundingBox) {
    analysisResult.boundingBox.getSize(size!)
  }

  return (
    <aside className="w-64 border-r bg-card flex flex-col h-full overflow-y-auto">
      <div className="p-4">
        <h1 className="text-xl font-bold text-primary">Shen3D</h1>
        <p className="text-xs text-muted-foreground">iBar Splitter</p>
      </div>
      <Separator />

      {/* Camini vite rilevati */}
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">CAMINI VITE</p>
        {analysisResult ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {analysisResult.channels.length} canale/i rilevato/i
            </p>
            {analysisResult.channels.map((channel, i) => (
              <div
                key={channel.id}
                className={`p-2 rounded text-xs cursor-pointer
                  ${selectedImplant === i ? 'bg-amber-500/20 border border-amber-500' : 'bg-muted'}`}
                onClick={() => onImplantSelect?.(selectedImplant === i ? null : i)}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    Canale {i + 1}
                    {channel.source === 'manual' && (
                      <span className="ml-1 text-[10px] text-indigo-400">(manuale)</span>
                    )}
                  </p>
                  {onChannelRemove && (
                    <button
                      className="text-muted-foreground hover:text-red-400 px-1"
                      title="Rimuovi canale"
                      onClick={(e) => { e.stopPropagation(); onChannelRemove(i) }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p>Raggio: {channel.radius.toFixed(2)}mm · Altezza: {channel.height.toFixed(1)}mm</p>
                <p>Confidenza: {(channel.confidence * 100).toFixed(0)}%</p>
              </div>
            ))}
            {analysisResult.insertionAxis && (
              <p className="text-[10px] text-muted-foreground">
                Asse inserzione: ({analysisResult.insertionAxis.x.toFixed(2)}, {analysisResult.insertionAxis.y.toFixed(2)}, {analysisResult.insertionAxis.z.toFixed(2)})
              </p>
            )}
            {analysisResult.channels.length > 0 && axisAdjustment && onAxisAdjustmentChange && (
              <div className="pt-2">
                <InsertionAxisControls
                  adjustment={axisAdjustment}
                  onChange={onAxisAdjustmentChange}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun modello caricato</p>
        )}
      </div>
      <Separator />

      {/* Parametri split */}
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">PARAMETRI SPLIT</p>
        <ParamsPanel params={barParams} onChange={onBarParamsChange} />
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
            <p>Camini vite: {analysisResult.channels.length}</p>
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

      {/* Export annotazioni */}
      <div className="p-4 border-t space-y-2">
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
