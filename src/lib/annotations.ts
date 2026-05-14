export interface Annotation {
  id: string
  stlFileName: string
  createdAt: string
  implantCount: number
  cutLinePoints: number[][] // array di [x, y, z]
  profile: 'oval' | 'd-shape' | 'rectangular' | 'custom'
  thickness: number // mm
  notes: string
}

export function saveAnnotation(annotation: Annotation): void {
  const existing: Annotation[] = JSON.parse(localStorage.getItem('shen3d-annotations') || '[]')
  existing.push(annotation)
  localStorage.setItem('shen3d-annotations', JSON.stringify(existing))
}

export function getAnnotations(): Annotation[] {
  return JSON.parse(localStorage.getItem('shen3d-annotations') || '[]')
}

export function deleteAnnotation(id: string): void {
  const existing: Annotation[] = JSON.parse(localStorage.getItem('shen3d-annotations') || '[]')
  const filtered = existing.filter(a => a.id !== id)
  localStorage.setItem('shen3d-annotations', JSON.stringify(filtered))
}

export function getAnnotationCount(): number {
  return getAnnotations().length
}
