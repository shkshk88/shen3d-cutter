export interface SplitResult {
  upper?: { path: string; vertices: number; faces: number; volume?: number | null }
  lower?: { path: string; vertices: number; faces: number; volume?: number | null }
  engine: string
  error?: string
}

export interface ProfileResult {
  stl_path: string
  vertices: number
  faces: number
}

export async function uploadStlToServer(file: File): Promise<{ stl_path: string; size: number }> {
  const arrayBuffer = await file.arrayBuffer()

  const res = await fetch('/api/cutter/upload', {
    method: 'POST',
    body: arrayBuffer,
    headers: { 'Content-Type': 'application/octet-stream' },
  })

  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export async function splitStl(
  stlPath: string,
  planeNormal: [number, number, number],
  planePoint: [number, number, number],
  engine: 'trimesh' | 'freecad' = 'trimesh'
): Promise<SplitResult> {
  const res = await fetch('/api/cut', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stl_path: stlPath,
      plane_normal: planeNormal,
      plane_point: planePoint,
      engine,
    }),
  })

  if (!res.ok) throw new Error('Split failed')
  return res.json()
}

export async function generateProfile(
  type: string,
  params: Record<string, number>
): Promise<ProfileResult> {
  const res = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, params }),
  })

  if (!res.ok) throw new Error('Profile generation failed')
  return res.json()
}

export function getDownloadUrl(filename: string): string {
  return `/api/download/${filename}`
}
