'use client'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { AxisAdjustment, DEFAULT_AXIS_ADJUSTMENT } from '@/lib/screw-channels'

interface InsertionAxisControlsProps {
  adjustment: AxisAdjustment
  onChange: (adjustment: AxisAdjustment) => void
}

function TiltRow({ label, value, onChange }: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-10">{label}</span>
      <Slider
        min={-15}
        max={15}
        step={0.5}
        value={[value]}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : (v as number))}
      />
      <span className="text-xs w-10 text-right">{value > 0 ? '+' : ''}{value.toFixed(1)}°</span>
    </div>
  )
}

/**
 * Regolazione fine dell'asse di inserzione: flip del verso + due tilt
 * ortogonali (±15°) rispetto alla media degli assi dei camini.
 */
export function InsertionAxisControls({ adjustment, onChange }: InsertionAxisControlsProps) {
  const isDefault =
    !adjustment.flipped && adjustment.tiltU === 0 && adjustment.tiltV === 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">ASSE INSERZIONE</p>
        <div className="flex gap-1">
          <Button
            variant={adjustment.flipped ? 'default' : 'outline'}
            size="xs"
            onClick={() => onChange({ ...adjustment, flipped: !adjustment.flipped })}
            title="Inverte il verso dell'asse (occlusale/intaglio)"
          >
            ⇅ Flip
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onChange(DEFAULT_AXIS_ADJUSTMENT)}
            disabled={isDefault}
          >
            Reset
          </Button>
        </div>
      </div>
      <TiltRow
        label="Tilt A"
        value={adjustment.tiltU}
        onChange={(v) => onChange({ ...adjustment, tiltU: v })}
      />
      <TiltRow
        label="Tilt B"
        value={adjustment.tiltV}
        onChange={(v) => onChange({ ...adjustment, tiltV: v })}
      />
    </div>
  )
}
