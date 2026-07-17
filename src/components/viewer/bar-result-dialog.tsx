'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { JobStatus, PartResult, getDownloadUrl } from '@/lib/bar-client'

interface BarResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: JobStatus | null
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

export function BarResultDialog({ open, onOpenChange, job }: BarResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
            <PartCard label="Barra primaria" color="#6366f1" data={job.result.bar} />
            <PartCard label="Sovrastruttura" color="#f59e0b" data={job.result.superstructure} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun risultato disponibile</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
