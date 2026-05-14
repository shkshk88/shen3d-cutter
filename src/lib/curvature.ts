import * as THREE from 'three'

/**
 * Calcola la curvatura Gaussiana per ogni vertice della mesh.
 * La curvatura Gaussiana K = k1 * k2 dove k1, k2 sono le curvature principali.
 * - K > 0: superficie convessa (come una sfera)
 * - K < 0: superficie a sella (come il solco tra due parti)
 * - K ~ 0: superficie piatta o cilindrica
 */
export function computeGaussianCurvature(geometry: THREE.BufferGeometry): Float32Array {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const idx = geometry.getIndex()
  const vertexCount = pos.count
  const curvature = new Float32Array(vertexCount)

  if (!idx) return curvature

  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute
  if (!normals) {
    geometry.computeVertexNormals()
  }

  const angleSum = new Float32Array(vertexCount)
  const neighborCount = new Uint32Array(vertexCount)

  const nA = new THREE.Vector3(), nB = new THREE.Vector3(), nC = new THREE.Vector3()

  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2)

    nA.fromBufferAttribute(geometry.getAttribute('normal'), a)
    nB.fromBufferAttribute(geometry.getAttribute('normal'), b)
    nC.fromBufferAttribute(geometry.getAttribute('normal'), c)

    angleSum[a] += (1 - nA.dot(nB)) + (1 - nA.dot(nC))
    angleSum[b] += (1 - nB.dot(nA)) + (1 - nB.dot(nC))
    angleSum[c] += (1 - nC.dot(nA)) + (1 - nC.dot(nB))

    neighborCount[a] += 2
    neighborCount[b] += 2
    neighborCount[c] += 2
  }

  for (let i = 0; i < vertexCount; i++) {
    curvature[i] = neighborCount[i] > 0 ? angleSum[i] / neighborCount[i] : 0
  }

  return curvature
}

/**
 * Trova i vertici con curvatura alta (feature edges / solchi)
 */
export function findHighCurvatureVertices(
  curvature: Float32Array,
  threshold: number = 0.5
): number[] {
  const indices: number[] = []
  const sorted = Array.from(curvature).sort((a, b) => a - b)
  const percentile = sorted[Math.floor(sorted.length * threshold)]

  for (let i = 0; i < curvature.length; i++) {
    if (curvature[i] > percentile) {
      indices.push(i)
    }
  }
  return indices
}
