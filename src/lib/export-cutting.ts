import { CuttingResult } from './cutting-plane'

export interface CuttingExport {
  fileName: string
  timestamp: string
  implants: Array<{
    index: number
    center: [number, number, number]
    axis: [number, number, number]
    radius: number
  }>
  planes: Array<{
    id: string
    method: string
    normal: [number, number, number]
    point: [number, number, number]
    offset: number
    tiltAngle: number
    confidence: number
  }>
  selectedPlaneId: string | null
}

export function exportCuttingParams(
  result: CuttingResult,
  selectedPlaneId: string | null,
  fileName: string,
  planeParams: Record<string, { offset: number; tiltAngle: number }>
): CuttingExport {
  return {
    fileName,
    timestamp: new Date().toISOString(),
    implants: result.implants.map(imp => ({
      index: imp.index,
      center: [imp.center.x, imp.center.y, imp.center.z] as [number, number, number],
      axis: [imp.axis.x, imp.axis.y, imp.axis.z] as [number, number, number],
      radius: imp.radius,
    })),
    planes: result.planes.map(plane => {
      const params = planeParams[plane.id]
      return {
        id: plane.id,
        method: plane.method,
        normal: [plane.normal.x, plane.normal.y, plane.normal.z] as [number, number, number],
        point: [plane.point.x, plane.point.y, plane.point.z] as [number, number, number],
        offset: params?.offset ?? plane.offset,
        tiltAngle: params?.tiltAngle ?? plane.tiltAngle,
        confidence: plane.confidence,
      }
    }),
    selectedPlaneId,
  }
}

export function downloadCuttingParams(
  result: CuttingResult,
  selectedPlaneId: string | null,
  fileName: string,
  planeParams: Record<string, { offset: number; tiltAngle: number }>
): void {
  const data = exportCuttingParams(result, selectedPlaneId, fileName, planeParams)
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shen3d-cutting-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}
