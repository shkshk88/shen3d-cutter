'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'

const StlViewer = dynamic(() => import('./stl-viewer').then(mod => ({ default: mod.StlViewer })), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})

export function ViewerSection() {
  const [stlUrl, setStlUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setStlUrl(url)
    setFileName(file.name)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setStlUrl(url)
    setFileName(file.name)
  }, [])

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-12 border-b flex items-center px-4 gap-4 bg-card">
        <span className="text-sm font-medium">{fileName || 'Nessun file caricato'}</span>
        <label className="cursor-pointer">
          <Button variant="outline" size="sm" onClick={() => document.getElementById('stl-upload')?.click()}>
            Carica STL
          </Button>
          <input id="stl-upload" type="file" accept=".stl" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      {/* Viewer or Drop Zone */}
      <div
        className="flex-1 relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {stlUrl ? (
          <StlViewer url={stlUrl} />
        ) : (
          <div className="h-full flex items-center justify-center border-2 border-dashed rounded-lg m-4">
            <div className="text-center">
              <p className="text-lg text-muted-foreground">Trascina qui un file STL</p>
              <p className="text-sm text-muted-foreground mt-2">oppure clicca &quot;Carica STL&quot;</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
