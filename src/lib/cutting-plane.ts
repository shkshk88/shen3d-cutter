import * as THREE from 'three'
import { MeshAnalysisResult } from './mesh-analysis'

/** Un singolo impianto con dati estesi per il taglio */
export interface ImplantForCutting {
  index: number
  center: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  topPoint: THREE.Vector3
  bottomPoint: THREE.Vector3
  junctionPoint: THREE.Vector3
}

/** Piano di taglio proposto dall'AI */
export interface CuttingPlane {
  id: string
  normal: THREE.Vector3
  point: THREE.Vector3
  confidence: number
  method: 'junction' | 'midpoint' | 'curvature'
  implantIndices: number[]
  offset: number
  tiltAngle: number
  tiltAxis: THREE.Vector3
}

/** Linea di taglio visualizzata sulla superficie STL */
export interface CutLine {
  id: string
  planeId: string
  points: THREE.Vector3[]
  closed: boolean
}

/** Applica parametri offset e tilt a un piano di taglio */
export function applyPlaneParams(plane: CuttingPlane): {
  effectiveNormal: THREE.Vector3
  effectivePoint: THREE.Vector3
} {
  const effectivePoint = plane.point.clone().add(
    plane.normal.clone().multiplyScalar(plane.offset)
  )

  const effectiveNormal = plane.normal.clone()
  if (plane.tiltAngle !== 0) {
    const quat = new THREE.Quaternion().setFromAxisAngle(
      plane.tiltAxis.clone().normalize(),
      THREE.MathUtils.degToRad(plane.tiltAngle)
    )
    effectiveNormal.applyQuaternion(quat).normalize()
  }

  return { effectiveNormal, effectivePoint }
}

/** Risultato completo della fase di taglio */
export interface CuttingResult {
  implants: ImplantForCutting[]
  planes: CuttingPlane[]
  lines: CutLine[]
  averageAxis: THREE.Vector3
}

function findJunctionPoint(
  center: THREE.Vector3,
  axis: THREE.Vector3,
  height: number,
): THREE.Vector3 {
  const normalizedAxis = axis.clone().normalize()
  const bottomPoint = center.clone().sub(normalizedAxis.clone().multiplyScalar(height / 2))
  const junctionRatio = 0.65
  return bottomPoint.clone().add(
    normalizedAxis.clone().multiplyScalar(height * junctionRatio)
  )
}

export function prepareImplantsForCutting(
  analysisResult: MeshAnalysisResult
): ImplantForCutting[] {
  const normalizedAxis = new THREE.Vector3()

  return analysisResult.cylinderCandidates.map((cyl, index) => {
    normalizedAxis.copy(cyl.axis).normalize()
    const height = cyl.height || (cyl.radius * 4)

    const topPoint = cyl.center.clone().add(normalizedAxis.clone().multiplyScalar(height / 2))
    const bottomPoint = cyl.center.clone().sub(normalizedAxis.clone().multiplyScalar(height / 2))

    const junctionPoint = findJunctionPoint(cyl.center, normalizedAxis, height)

    return {
      index,
      center: cyl.center.clone(),
      axis: normalizedAxis.clone(),
      radius: cyl.radius,
      topPoint,
      bottomPoint,
      junctionPoint,
    }
  })
}

function computeTiltAxis(normal: THREE.Vector3): THREE.Vector3 {
  const n = normal.clone().normalize()
  const xz = new THREE.Vector3(n.x, 0, n.z)
  if (xz.lengthSq() < 0.0001) {
    return new THREE.Vector3(1, 0, 0)
  }
  const tiltAxis = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize()
  return tiltAxis
}

export function generateCuttingPlanes(implants: ImplantForCutting[]): CuttingPlane[] {
  if (implants.length === 0) return []

  const planes: CuttingPlane[] = []

  for (const implant of implants) {
    const normal = implant.axis.clone()
    planes.push({
      id: `plane-junction-${implant.index}`,
      normal,
      point: implant.junctionPoint.clone(),
      confidence: 0.7,
      method: 'junction',
      implantIndices: [implant.index],
      offset: 0,
      tiltAngle: 0,
      tiltAxis: computeTiltAxis(normal),
    })
  }

  if (implants.length >= 2) {
    const averageAxis = new THREE.Vector3()
    for (const imp of implants) {
      averageAxis.add(imp.axis)
    }
    averageAxis.normalize()

    const midpoint = new THREE.Vector3()
    for (const imp of implants) {
      midpoint.add(imp.junctionPoint)
    }
    midpoint.divideScalar(implants.length)

    planes.push({
      id: 'plane-unified',
      normal: averageAxis.clone(),
      point: midpoint.clone(),
      confidence: 0.85,
      method: 'midpoint',
      implantIndices: implants.map(i => i.index),
      offset: 0,
      tiltAngle: 0,
      tiltAxis: computeTiltAxis(averageAxis),
    })
  }

  return planes
}

export function computeCuttingResult(
  analysisResult: MeshAnalysisResult
): CuttingResult {
  const implants = prepareImplantsForCutting(analysisResult)
  const planes = generateCuttingPlanes(implants)

  const averageAxis = new THREE.Vector3()
  if (implants.length > 0) {
    for (const imp of implants) averageAxis.add(imp.axis)
    averageAxis.normalize()
  }

  const lines: CutLine[] = []

  return { implants, planes, lines, averageAxis }
}
