'use client'

import { Sidebar } from '@/components/layout/sidebar'

export function ViewerSection() {
  return (
    <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg m-4">
      <div className="text-center">
        <p className="text-lg text-muted-foreground">Trascina qui un file STL</p>
        <p className="text-sm text-muted-foreground mt-2">oppure clicca &quot;Carica STL&quot;</p>
      </div>
    </div>
  )
}
