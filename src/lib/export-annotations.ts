import { getAnnotations } from './annotations'

export function exportAnnotationsAsJSON(): string {
  const annotations = getAnnotations()
  return JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    totalAnnotations: annotations.length,
    annotations,
  }, null, 2)
}

export function downloadAnnotations(): void {
  const json = exportAnnotationsAsJSON()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shen3d-annotations-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}
