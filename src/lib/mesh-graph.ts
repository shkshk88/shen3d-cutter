import * as THREE from 'three'

/**
 * Grafo a vertici unici costruito da una BufferGeometry.
 *
 * Le geometrie caricate da STLLoader NON sono indicizzate: ogni triangolo ha
 * i suoi 3 vertici duplicati, quindi qualsiasi analisi basata su adiacenza
 * (curvatura, clustering, fit di cilindri) deve prima unificare i vertici
 * coincidenti. Il grafo mantiene la mappa render→unico per riportare i
 * risultati (es. colori curvatura) sui vertici di rendering.
 */
export interface MeshGraph {
  /** Numero di vertici unici */
  uniqueCount: number
  /** Posizioni dei vertici unici (xyz interleaved, in mm) */
  positions: Float32Array
  /** Mappa vertice di rendering → id vertice unico */
  renderToUnique: Uint32Array
  /** Triangoli come triple di id unici */
  triangles: Uint32Array
  /** Normali per vertice unico (pesate per area, normalizzate) */
  normals: Float32Array
}

export function buildMeshGraph(
  geometry: THREE.BufferGeometry,
  tolerance = 1e-4
): MeshGraph {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const index = geometry.getIndex()
  const renderCount = pos.count

  const keyToId = new Map<string, number>()
  const renderToUnique = new Uint32Array(renderCount)
  const uniquePositions: number[] = []
  const inv = 1 / tolerance

  for (let i = 0; i < renderCount; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const key = `${Math.round(x * inv)}_${Math.round(y * inv)}_${Math.round(z * inv)}`
    let id = keyToId.get(key)
    if (id === undefined) {
      id = uniquePositions.length / 3
      keyToId.set(key, id)
      uniquePositions.push(x, y, z)
    }
    renderToUnique[i] = id
  }

  const triCount = index ? index.count / 3 : renderCount / 3
  const triangles = new Uint32Array(triCount * 3)
  for (let t = 0; t < triCount; t++) {
    for (let c = 0; c < 3; c++) {
      const renderIdx = index ? index.getX(t * 3 + c) : t * 3 + c
      triangles[t * 3 + c] = renderToUnique[renderIdx]
    }
  }

  const positions = Float32Array.from(uniquePositions)
  const uniqueCount = positions.length / 3

  // Normali per vertice unico, pesate per area (cross product non normalizzato)
  const normals = new Float32Array(uniqueCount * 3)
  for (let t = 0; t < triCount; t++) {
    const a = triangles[t * 3], b = triangles[t * 3 + 1], c = triangles[t * 3 + 2]
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2]
    const e1x = positions[b * 3] - ax, e1y = positions[b * 3 + 1] - ay, e1z = positions[b * 3 + 2] - az
    const e2x = positions[c * 3] - ax, e2y = positions[c * 3 + 1] - ay, e2z = positions[c * 3 + 2] - az
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    for (const v of [a, b, c]) {
      normals[v * 3] += nx
      normals[v * 3 + 1] += ny
      normals[v * 3 + 2] += nz
    }
  }
  for (let v = 0; v < uniqueCount; v++) {
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2]
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (len > 1e-12) {
      normals[v * 3] /= len
      normals[v * 3 + 1] /= len
      normals[v * 3 + 2] /= len
    }
  }

  return { uniqueCount, positions, renderToUnique, triangles, normals }
}
