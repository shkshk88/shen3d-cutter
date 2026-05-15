import * as THREE from 'three'

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
