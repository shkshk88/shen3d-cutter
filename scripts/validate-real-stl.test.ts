/**
 * Validazione headless su STL reali (ponti All-on-X da caso reale).
 *
 * Esegue l'intera catena browser-side in Node: STLLoader → grafo mesh →
 * curvatura → rilevamento camini vite → proposta curva di split → validazione,
 * e scrive i job.json pronti per la pipeline backend
 * (server/tests/run_real_case.py).
 *
 * Ground truth dal naming dei file (siti implantari FDI):
 *  - superiore 16-13-11-23-26 → 5 camini
 *  - inferiore 36-34-44-46   → 4 camini
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import * as THREE from 'three'
import { STLLoader } from 'three-stdlib'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import { buildMeshGraph } from '../src/lib/mesh-graph'
import { computeCurvatureFromGraph } from '../src/lib/curvature'
import { detectScrewChannels, ScrewChannel, computeInsertionAxis } from '../src/lib/screw-channels'
import { proposeSplitCurve, densifySplitCurve, validateSplitCurve, serializeCurvePoints } from '../src/lib/split-curve'

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

const SAMPLES_DIR = 'stl-samples/full-arch-bridges'
const OUT_DIR = 'test-assets'

const CASES = [
  {
    name: 'superiore-16-13-11-23-26',
    file: `${SAMPLES_DIR}/2023-10-30_00002-002-16-13-11-23-26-waxup_slm_cad.stl`,
    expectedChannels: 5,
  },
  {
    name: 'inferiore-36-34-44-46',
    file: `${SAMPLES_DIR}/2023-10-30_00002-002-36-34-44-46-waxup_slm_cad.stl`,
    expectedChannels: 4,
  },
] as const

function loadGeometry(path: string): THREE.BufferGeometry {
  const buf = readFileSync(path)
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const geometry = new STLLoader().parse(arrayBuffer)
  geometry.computeVertexNormals()
  geometry.computeBoundsTree()
  return geometry
}

/**
 * Orienta i canali verso l'occlusale: il grosso del volume (denti) sta dal
 * lato occlusale, quindi l'asse deve puntare dal centro dei canali verso il
 * baricentro della mesh.
 */
function orientTowardOcclusal(channels: ScrewChannel[], centroid: THREE.Vector3): void {
  if (channels.length === 0) return
  const channelCenter = new THREE.Vector3()
  for (const ch of channels) channelCenter.add(ch.center)
  channelCenter.divideScalar(channels.length)

  const toCentroid = new THREE.Vector3().subVectors(centroid, channelCenter)
  const meanAxis = computeInsertionAxis(channels)!
  if (meanAxis.dot(toCentroid) < 0) {
    for (const ch of channels) {
      ch.axis.negate()
      const t = ch.top
      ch.top = ch.bottom
      ch.bottom = t
    }
  }
}

describe.skipIf(!existsSync(SAMPLES_DIR))('validazione STL reali', () => {
  for (const testCase of CASES) {
    it(`${testCase.name}: rileva ${testCase.expectedChannels} camini e propone una curva valida`, () => {
      const t0 = Date.now()
      const geometry = loadGeometry(testCase.file)
      const graph = buildMeshGraph(geometry)
      const tGraph = Date.now()
      const curvature = computeCurvatureFromGraph(graph)
      const channels = detectScrewChannels(geometry, graph, curvature)
      const tDetect = Date.now()

      const centroid = new THREE.Vector3()
      for (let i = 0; i < graph.uniqueCount; i++) {
        centroid.x += graph.positions[i * 3]
        centroid.y += graph.positions[i * 3 + 1]
        centroid.z += graph.positions[i * 3 + 2]
      }
      centroid.divideScalar(graph.uniqueCount)
      orientTowardOcclusal(channels, centroid)
      const insertionAxis = computeInsertionAxis(channels)

      console.log(`\n=== ${testCase.name} ===`)
      console.log(`grafo: ${graph.uniqueCount} vertici unici (${tGraph - t0}ms), detection: ${tDetect - tGraph}ms`)
      console.log(`canali rilevati: ${channels.length} (attesi: ${testCase.expectedChannels})`)
      for (const ch of channels) {
        console.log(
          `  ${ch.id}: c=(${ch.center.x.toFixed(1)}, ${ch.center.y.toFixed(1)}, ${ch.center.z.toFixed(1)}) ` +
          `r=${ch.radius.toFixed(2)}mm h=${ch.height.toFixed(1)}mm ` +
          `axis=(${ch.axis.x.toFixed(2)}, ${ch.axis.y.toFixed(2)}, ${ch.axis.z.toFixed(2)}) conf=${(ch.confidence * 100).toFixed(0)}%`
        )
      }
      if (insertionAxis) {
        console.log(`asse inserzione: (${insertionAxis.x.toFixed(2)}, ${insertionAxis.y.toFixed(2)}, ${insertionAxis.z.toFixed(2)})`)
      }

      expect(channels.length).toBe(testCase.expectedChannels)
      expect(insertionAxis).not.toBeNull()

      // Proposta curva di split
      const proposed = proposeSplitCurve({
        graph,
        channels,
        insertionAxis,
        geometry,
        curvaturePerUnique: curvature,
      })
      expect(proposed).not.toBeNull()
      expect(proposed!.closed).toBe(true)

      const densified = densifySplitCurve(proposed!, geometry)
      const validation = validateSplitCurve(proposed!, densified, channels, insertionAxis)
      console.log(`curva proposta: ${proposed!.controlPoints.length} punti controllo → ${densified.length} densificati`)
      console.log(`validazione: ${validation.valid ? 'OK' : 'ERRORI: ' + validation.errors.join(' · ')}`)

      expect(validation.valid).toBe(true)

      // Esporta il job per la pipeline backend
      mkdirSync(OUT_DIR, { recursive: true })
      const job = {
        stl_path: testCase.file,
        curve: serializeCurvePoints(densified),
        insertion_axis: [insertionAxis!.x, insertionAxis!.y, insertionAxis!.z],
        channels: channels.map(ch => ({
          center: [ch.center.x, ch.center.y, ch.center.z],
          axis: [ch.axis.x, ch.axis.y, ch.axis.z],
          radius: ch.radius,
          top: [ch.top.x, ch.top.y, ch.top.z],
          bottom: [ch.bottom.x, ch.bottom.y, ch.bottom.z],
        })),
        params: {},
      }
      const jobPath = `${OUT_DIR}/${testCase.name}.job.json`
      writeFileSync(jobPath, JSON.stringify(job, null, 2))
      console.log(`job scritto: ${jobPath}`)
    }, 300_000)
  }
})
