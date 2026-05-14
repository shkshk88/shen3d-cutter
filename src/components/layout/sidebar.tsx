'use client'

import { Separator } from '@/components/ui/separator'

export function Sidebar() {
  return (
    <aside className="w-64 border-r bg-card flex flex-col">
      <div className="p-4">
        <h1 className="text-xl font-bold text-primary">Shen3D</h1>
        <p className="text-xs text-muted-foreground">Cutter Parametrico AI</p>
      </div>
      <Separator />
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">IMPIANTI RILEVATI</p>
        <p className="text-sm text-muted-foreground" id="implant-count">Nessun modello caricato</p>
      </div>
      <Separator />
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">PROPRIETÀ</p>
        <div id="model-info" className="text-sm text-muted-foreground">
          <p>Carica un STL per iniziare</p>
        </div>
      </div>
    </aside>
  )
}
