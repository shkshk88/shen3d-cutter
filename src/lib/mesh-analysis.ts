import * as THREE from 'three'
import { computeGaussianCurvature, findHighCurvatureVertices } from './curvature'

export interface MeshAnalysisResult {
  vertexCount: number
  faceCount: number
  boundingBox: THREE.Box3
  boundingSphere: THREE.Sphere
  curvature: Float32Array
  highCurvatureIndices: number[]
  cylinderCandidates: CylinderCandidate[]
}

export interface CylinderCandidate {
  center: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  height: number
  vertexIndices: number[]
  confidence: number
}

/**
 * Analisi completa della mesh — punto di ingresso
 */
export function analyzeMesh(geometry: THREE.BufferGeometry): MeshAnalysisResult {
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.computeVertexNormals()

  const curvature = computeGaussianCurvature(geometry)
  const highCurvatureIndices = findHighCurvatureVertices(curvature)
  const cylinderCandidates = detectCylinders(geometry)

  return {
    vertexCount: geometry.getAttribute('position').count,
    faceCount: geometry.getIndex()?.count ? Math.floor(geometry.getIndex()!.count / 3) : 0,
    boundingBox: geometry.boundingBox!,
    boundingSphere: geometry.boundingSphere!,
    curvature,
    highCurvatureIndices,
    cylinderCandidates,
  }
}

/**
 * Rileva cilindri nella mesh (impianti dentali).
 * Strategia: RANSAC su assi di simmetria cilindrica.
 */
export function detectCylinders(
  geometry: THREE.BufferGeometry,
  minRadius: number = 1.5,
  maxRadius: number = 4.0,
  minInlierRatio: number = 0.01,
  iterations: number = 500
): CylinderCandidate[] {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const vertexCount = pos.count
  const vertices: THREE.Vector3[] = []

  for (let i = 0; i < vertexCount; i++) {
    vertices.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
  }

  const candidates: CylinderCandidate[] = []

  for (let iter = 0; iter < iterations; iter++) {
    const i = Math.floor(Math.random() * vertexCount)
    const j = Math.floor(Math.random() * vertexCount)
    const k = Math.floor(Math.random() * vertexCount)

    if (i === j || j === k || i === k) continue

    const p1 = vertices[i], p2 = vertices[j], p3 = vertices[k]

    const v12 = new THREE.Vector3().subVectors(p2, p1)
    const v13 = new THREE.Vector3().subVectors(p3, p1)
    const normal = new THREE.Vector3().crossVectors(v12, v13).normalize()

    if (normal.length() < 0.01) continue

    const center = new THREE.Vector3().addVectors(p1, p2).add(p3).divideScalar(3)

    const d1 = new THREE.Vector3().subVectors(p1, center).dot(normal.clone().negate())
    const r1 = p1.distanceTo(center.clone().add(normal.clone().multiplyScalar(d1)))
    const d2 = new THREE.Vector3().subVectors(p2, center).dot(normal.clone().negate())
    const r2 = p2.distanceTo(center.clone().add(normal.clone().multiplyScalar(d2)))

    const avgRadius = (r1 + r2) / 2

    if (avgRadius < minRadius || avgRadius > maxRadius) continue

    const inlierIndices: number[] = []
    const tolerance = avgRadius * 0.15

    for (let vi = 0; vi < vertexCount; vi++) {
      const v = vertices[vi]
      const projDist = Math.abs(v.clone().sub(center).dot(normal))
      const perpVec = v.clone().sub(center).sub(normal.clone().multiplyScalar(projDist))
      const perpDist = perpVec.length()
      if (Math.abs(perpDist - avgRadius) < tolerance) {
        inlierIndices.push(vi)
      }
    }

    const inlierRatio = inlierIndices.length / vertexCount

    if (inlierRatio >= minInlierRatio) {
      const inlierVertices = inlierIndices.map(idx => vertices[idx])
      const cylCenter = new THREE.Vector3()
      inlierVertices.forEach(v => cylCenter.add(v))
      cylCenter.divideScalar(inlierVertices.length)

      const isDuplicate = candidates.some(c =>
        c.center.distanceTo(cylCenter) < avgRadius * 2
      )

      if (!isDuplicate) {
        candidates.push({
          center: cylCenter,
          axis: normal,
          radius: avgRadius,
          height: 0,
          vertexIndices: inlierIndices,
          confidence: Math.min(inlierRatio * 10, 1),
        })
      }
    }
  }

  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
}
