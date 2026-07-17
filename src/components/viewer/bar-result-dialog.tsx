'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { JobStatus, PartResult, getDownloadUrl } from '@/lib/bar-client'
import { ResultPreview } from './result-preview'

interface BarResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: JobStatus | null
  /** Asse di inserzione per la vista esplosa */
  insertionAxis?: [number, number, number]
  /** Rilancia il job con i parametri correnti (stessa curva, stesso upload) */
  onRegenerate?: () => void
  regenerating?: boolean
}

interface ResultChecks {
  no_interpenetration?: boolean
  insertion?: { passive_fit?: boolean }
  channels_patent?: boolean[]
  gap?: { gap_min?: number | null; gap_median?: number | null }
  bar_thickness?: { thin_points?: [number, number, number][]; thickness_ok?: boolean | null }
}

function CheckBadge({ ok, label }: { ok: boolean | undefined; label: string }) {
  if (ok === undefined) return null
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

function PartCard({ label, color, data }: { label: string; color: string; data?: PartResult }) {
  if (!data) return null
  return (
    <div className="p-4 rounded-lg bg-muted border">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <p className="font-medium text-sm">{label}</p>
        {!data.watertight && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">non watertight</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground space-y-1 mb-3">
        <p>{data.vertices.toLocaleString()} vertici · {data.faces.toLocaleString()} facce</p>
        <p>Volume: {data.volume.toFixed(1)} mm³</p>
      </div>
      <a href={getDownloadUrl(data.file)} download={data.file}>
        <Button size="sm">Scarica STL</Button>
      </a>
    </div>
  )
}

export function BarResultDialog({ open, onOpenChange, job, insertionAxis, onRegenerate, regenerating }: BarResultDialogProps) {
  const warnings = (job?.result as { warnings?: string[] } | undefined)?.warnings ?? []
  const resultChecks = (job?.result?.checks ?? {}) as ResultChecks
  const thinSpots = resultChecks.bar_thickness?.thin_points
  const gapMedian = resultChecks.gap?.gap_median

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Risultato Split Barra</DialogTitle>
        </DialogHeader>
        {job?.status === 'error' ? (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive text-sm text-destructive">
            <p className="font-medium mb-1">
              Errore{job.failed_stage ? ` (stage ${job.failed_stage})` : ''}
            </p>
            <p>{job.error}</p>
          </div>
        ) : job?.status === 'done' && job.result ? (
          <div className="space-y-3">
            <ResultPreview
              barFile={job.result.bar.file}
              superFile={job.result.superstructure.file}
              axis={insertionAxis ?? [0, 1, 0]}
              thinSpots={thinSpots}
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              <CheckBadge ok={resultChecks.no_interpenetration} label="no compenetrazione" />
              <CheckBadge ok={resultChecks.insertion?.passive_fit} label="fit passivo" />
              {resultChecks.channels_patent && resultChecks.channels_patent.length > 0 && (
                <CheckBadge
                  ok={resultChecks.channels_patent.every(Boolean)}
                  label={`canali pervi (${resultChecks.channels_patent.filter(Boolean).length}/${resultChecks.channels_patent.length})`}
                />
              )}
              {typeof gapMedian === 'number' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
                  gap mediano {(gapMedian * 1000).toFixed(0)}µm
                </span>
              )}
            </div>
            {warnings.length > 0 && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/40 text-xs text-amber-400 space-y-0.5">
                {warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <PartCard label="Barra primaria" color="#6366f1" data={job.result.bar} />
              <PartCard label="Sovrastruttura" color="#f59e0b" data={job.result.superstructure} />
            </div>
            {onRegenerate && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onRegenerate}
                disabled={regenerating}
              >
                {regenerating ? (
                  <><span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block mr-2" />Rigenero…</>
                ) : (
                  '↻ Rigenera con i parametri correnti'
                )}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun risultato disponibile</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
