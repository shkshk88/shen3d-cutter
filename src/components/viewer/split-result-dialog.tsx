'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SplitResult, getDownloadUrl } from '@/lib/cutter-client'

interface SplitResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: SplitResult | null
}

function PartCard({ label, data }: { label: string; data: { path: string; vertices: number; faces: number } | undefined }) {
  if (!data) return null
  const filename = data.path.split('/').pop() ?? 'part.stl'

  return (
    <div className="p-4 rounded-lg bg-muted border">
      <p className="font-medium text-sm mb-2">{label}</p>
      <div className="text-xs text-muted-foreground space-y-1 mb-3">
        <p>{data.vertices.toLocaleString()} vertici</p>
        <p>{data.faces.toLocaleString()} facce</p>
      </div>
      <a href={getDownloadUrl(filename)} download={filename}>
        <Button size="sm">Scarica STL</Button>
      </a>
    </div>
  )
}

export function SplitResultDialog({ open, onOpenChange, result }: SplitResultDialogProps) {
  const hasError = result?.error
  const hasUpper = result?.upper && result.upper.vertices > 0
  const hasLower = result?.lower && result.lower.vertices > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Risultato Taglio</DialogTitle>
        </DialogHeader>
        {hasError ? (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive text-sm text-destructive">
            Errore: {result.error}
          </div>
        ) : (
          <div className="space-y-3">
            <PartCard label="Parte superiore" data={hasUpper ? result!.upper : undefined} />
            <PartCard label="Parte inferiore" data={hasLower ? result!.lower : undefined} />
            {!hasUpper && !hasLower && (
              <p className="text-sm text-muted-foreground">Nessuna parte generata</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
