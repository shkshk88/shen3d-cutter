'use client'

import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { BarParams } from '@/lib/bar-client'

interface ParamsPanelProps {
  params: BarParams
  onChange: (params: BarParams) => void
}

function ParamRow({ label, value, display, min, max, step, onChange }: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{display}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : (v as number))}
      />
    </div>
  )
}

/** Parametri clinici dello split barra/sovrastruttura (mm reali). */
export function ParamsPanel({ params, onChange }: ParamsPanelProps) {
  return (
    <div className="space-y-3">
      <ParamRow
        label="Gap cemento"
        value={params.cement_gap_mm * 1000}
        display={`${Math.round(params.cement_gap_mm * 1000)}µm`}
        min={30}
        max={150}
        step={5}
        onChange={(v) => onChange({ ...params, cement_gap_mm: v / 1000 })}
      />
      <ParamRow
        label="Parete camino"
        value={params.channel_wall_mm}
        display={`${params.channel_wall_mm.toFixed(1)}mm`}
        min={0.3}
        max={1.0}
        step={0.1}
        onChange={(v) => onChange({ ...params, channel_wall_mm: v })}
      />
      <ParamRow
        label="Spessore min barra"
        value={params.bar_min_thickness_mm}
        display={`${params.bar_min_thickness_mm.toFixed(1)}mm`}
        min={1.0}
        max={4.0}
        step={0.5}
        onChange={(v) => onChange({ ...params, bar_min_thickness_mm: v })}
      />
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Camino</span>
        <Button
          variant="outline"
          size="xs"
          onClick={() => onChange({
            ...params,
            chimney_mode: params.chimney_mode === 'through' ? 'stop_below_occlusal' : 'through',
          })}
        >
          {params.chimney_mode === 'through' ? 'Passante' : 'Sotto occlusale'}
        </Button>
      </div>
    </div>
  )
}
