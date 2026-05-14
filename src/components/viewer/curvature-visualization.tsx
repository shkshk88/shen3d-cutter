'use client'

import * as THREE from 'three'

/**
 * Colora i vertici in base alla curvatura:
 * - Blu = curvatura bassa (superficie piatta/liscia)
 * - Verde = curvatura media
 * - Giallo = curvatura alta (spigoli, transizioni)
 * - Rosso = curvatura molto alta (solchi, feature)
 */
export function curvatureToColor(curvature: Float32Array): Float32Array {
  const colors = new Float32Array(curvature.length * 3)

  let maxCurv = 0
  for (let i = 0; i < curvature.length; i++) {
    if (curvature[i] > maxCurv) maxCurv = curvature[i]
  }
  if (maxCurv === 0) maxCurv = 1

  for (let i = 0; i < curvature.length; i++) {
    const t = Math.min(curvature[i] / maxCurv, 1)
    let r: number, g: number, b: number

    if (t < 0.25) {
      r = 0; g = t * 4; b = 1
    } else if (t < 0.5) {
      r = 0; g = 1; b = 1 - (t - 0.25) * 4
    } else if (t < 0.75) {
      r = (t - 0.5) * 4; g = 1; b = 0
    } else {
      r = 1; g = 1 - (t - 0.75) * 4; b = 0
    }

    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }

  return colors
}

/**
 * Applica la heat map curvatura alla geometria, modificando il vertex color.
 * Restituisce la geometria con l'attributo 'color' aggiunto.
 */
export function applyCurvatureColors(
  geometry: THREE.BufferGeometry,
  curvature: Float32Array
): void {
  const colors = curvatureToColor(curvature)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}
