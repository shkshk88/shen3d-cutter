import * as THREE from 'three'
import { ScrewChannel } from './screw-channels'
import { serializeCurvePoints } from './split-curve'

/**
 * Client per l'API v2 (split barra/sovrastruttura): job asincroni con polling.
 */

export interface BarParams {
  cement_gap_mm: number
  channel_wall_mm: number
  bar_min_thickness_mm: number
  blockout_step_mm: number
  chimney_mode: 'through' | 'stop_below_occlusal'
}

export const DEFAULT_BAR_PARAMS: BarParams = {
  cement_gap_mm: 0.08,
  channel_wall_mm: 0.5,
  bar_min_thickness_mm: 2.0,
  blockout_step_mm: 0.2,
  chimney_mode: 'through',
}

export interface PartResult {
  file: string
  vertices: number
  faces: number
  volume: number
  watertight: boolean
}

export interface JobStatus {
  job_id: string
  status: 'queued' | 'running' | 'done' | 'error'
  stage: string | null
  error: string | null
  failed_stage: string | null
  result?: {
    bar: PartResult
    superstructure: PartResult
    checks: Record<string, unknown>
  }
  stages?: Record<string, unknown>
  engine?: Record<string, unknown>
}

export async function uploadStlToServer(file: File): Promise<{ stl_path: string; size: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const res = await fetch('/api/cutter/upload', {
    method: 'POST',
    body: arrayBuffer,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
  if (!res.ok) throw new Error(`Upload fallito (${res.status})`)
  return res.json()
}

export async function startSplitBarJob(input: {
  stlPath: string
  curvePoints: THREE.Vector3[]
  insertionAxis: THREE.Vector3
  channels: ScrewChannel[]
  params: BarParams
}): Promise<string> {
  const res = await fetch('/api/split-bar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stl_path: input.stlPath,
      curve: serializeCurvePoints(input.curvePoints),
      insertion_axis: [input.insertionAxis.x, input.insertionAxis.y, input.insertionAxis.z],
      channels: input.channels.map(ch => ({
        center: [ch.center.x, ch.center.y, ch.center.z],
        axis: [ch.axis.x, ch.axis.y, ch.axis.z],
        radius: ch.radius,
        top: [ch.top.x, ch.top.y, ch.top.z],
        bottom: [ch.bottom.x, ch.bottom.y, ch.bottom.z],
      })),
      params: input.params,
    }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(`Avvio job fallito (${res.status}): ${JSON.stringify(detail?.detail ?? detail)}`)
  }
  const data = await res.json()
  return data.job_id as string
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Stato job non disponibile (${res.status})`)
  return res.json()
}

/** Polling fino a done/error. onUpdate riceve ogni stato intermedio. */
export async function pollJobUntilDone(
  jobId: string,
  onUpdate?: (status: JobStatus) => void,
  intervalMs = 1500,
  timeoutMs = 10 * 60 * 1000
): Promise<JobStatus> {
  const start = Date.now()
  for (;;) {
    const status = await getJobStatus(jobId)
    onUpdate?.(status)
    if (status.status === 'done' || status.status === 'error') return status
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timeout in attesa del job')
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

export function getDownloadUrl(filename: string): string {
  return `/api/download/${filename}`
}
