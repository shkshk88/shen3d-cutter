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
}

/** Linea di taglio visualizzata sulla superficie STL */
export interface CutLine {
  id: string
  planeId: string
  points: THREE.Vector3[]
  closed: boolean
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
