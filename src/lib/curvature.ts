import * as THREE from 'three'
import { MeshGraph, buildMeshGraph } from './mesh-graph'

/**
 * Curvatura discreta per vertice unico del grafo: deviazione angolare media
 * delle normali dei vertici adiacenti. Alta dove la superficie piega
 * bruscamente (creste, solchi, bordi dei camini vite).
 */
export function computeCurvatureFromGraph(graph: MeshGraph): Float32Array {
  const { uniqueCount, triangles, normals } = graph
  const angleSum = new Float32Array(uniqueCount)
  const neighborCount = new Uint32Array(uniqueCount)

  const dot = (a: number, b: number) =>
    normals[a * 3] * normals[b * 3] +
    normals[a * 3 + 1] * normals[b * 3 + 1] +
    normals[a * 3 + 2] * normals[b * 3 + 2]

  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2]
    const dab = 1 - dot(a, b)
    const dbc = 1 - dot(b, c)
    const dca = 1 - dot(c, a)
    angleSum[a] += dab + dca
    angleSum[b] += dab + dbc
    angleSum[c] += dbc + dca
    neighborCount[a] += 2
    neighborCount[b] += 2
    neighborCount[c] += 2
  }

  const curvature = new Float32Array(uniqueCount)
  for (let i = 0; i < uniqueCount; i++) {
    curvature[i] = neighborCount[i] > 0 ? angleSum[i] / neighborCount[i] : 0
  }
  return curvature
}

/** Espande valori per-vertice-unico a valori per-vertice-di-rendering */
export function expandToRenderVertices(
  graph: MeshGraph,
  perUnique: Float32Array
): Float32Array {
  const out = new Float32Array(graph.renderToUnique.length)
  for (let i = 0; i < out.length; i++) {
    out[i] = perUnique[graph.renderToUnique[i]]
  }
  return out
}

/**
 * Curvatura per vertice di rendering. Funziona anche su geometrie non
 * indicizzate (STLLoader) grazie al grafo a vertici unici — la versione
 * precedente ritornava zeri su geometrie senza index.
 */
export function computeGaussianCurvature(
  geometry: THREE.BufferGeometry,
  graph?: MeshGraph
): Float32Array {
  const g = graph ?? buildMeshGraph(geometry)
  return expandToRenderVertices(g, computeCurvatureFromGraph(g))
}

/**
 * Trova i vertici con curvatura alta (feature edges / solchi).
 * threshold = percentile (0.5 → mediana)
 */
export function findHighCurvatureVertices(
  curvature: Float32Array,
  threshold: number = 0.5
): number[] {
  const indices: number[] = []
  const sorted = Float32Array.from(curvature).sort()
  const percentile = sorted[Math.floor(sorted.length * threshold)]

  for (let i = 0; i < curvature.length; i++) {
    if (curvature[i] > percentile) {
      indices.push(i)
    }
  }
  return indices
}
