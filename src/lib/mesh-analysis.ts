import * as THREE from 'three'
import { computeCurvatureFromGraph, expandToRenderVertices, findHighCurvatureVertices } from './curvature'
import { buildMeshGraph, MeshGraph } from './mesh-graph'
import { detectScrewChannels, computeInsertionAxis, ScrewChannel } from './screw-channels'

export interface MeshAnalysisResult {
  vertexCount: number
  faceCount: number
  boundingBox: THREE.Box3
  boundingSphere: THREE.Sphere
  /** Curvatura per vertice di rendering (per la heat map) */
  curvature: Float32Array
  highCurvatureIndices: number[]
  /** Camini vite rilevati dalla mesh */
  channels: ScrewChannel[]
  /** Asse di inserzione di default (media assi camini), null se nessun camino */
  insertionAxis: THREE.Vector3 | null
  /** Grafo a vertici unici, riusato da editor curva e fit manuale canali */
  graph: MeshGraph
}

/**
 * Analisi completa della mesh — punto di ingresso.
 * La geometria deve essere in mm reali (frame originale del file STL).
 */
export function analyzeMesh(geometry: THREE.BufferGeometry): MeshAnalysisResult {
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals()
  }

  const graph = buildMeshGraph(geometry)
  const curvatureUnique = computeCurvatureFromGraph(graph)
  const curvature = expandToRenderVertices(graph, curvatureUnique)
  const highCurvatureIndices = findHighCurvatureVertices(curvature)
  const channels = detectScrewChannels(geometry, graph, curvatureUnique)
  const insertionAxis = computeInsertionAxis(channels)

  return {
    vertexCount: geometry.getAttribute('position').count,
    faceCount: Math.floor(graph.triangles.length / 3),
    boundingBox: geometry.boundingBox!,
    boundingSphere: geometry.boundingSphere!,
    curvature,
    highCurvatureIndices,
    channels,
    insertionAxis,
    graph,
  }
}
