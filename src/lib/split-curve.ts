import * as THREE from 'three'
import { MeshGraph } from './mesh-graph'
import { ScrewChannel } from './screw-channels'
import { computeCurvatureFromGraph } from './curvature'

/**
 * Curva di split: definisce dove separare barra primaria e sovrastruttura.
 * I punti di controllo giacciono sulla superficie della mesh; la curva
 * densificata (Catmull-Rom + riproiezione) viene inviata al backend.
 */
export interface SplitCurve {
  controlPoints: THREE.Vector3[]
  closed: boolean
}

export interface CurveValidation {
  valid: boolean
  errors: string[]
  /** Condizioni non bloccanti (es. curva rasente a un canale in zona a parete sottile) */
  warnings: string[]
}

export const EMPTY_SPLIT_CURVE: SplitCurve = { controlPoints: [], closed: false }

// ---------------------------------------------------------------------------
// Densificazione
// ---------------------------------------------------------------------------

/**
 * Densifica la curva con Catmull-Rom centripeta e riproietta ogni campione
 * sulla superficie della mesh (BVH closestPointToPoint) — la curva resta
 * "incollata" alla superficie anche tra i punti di controllo.
 */
export function densifySplitCurve(
  curve: SplitCurve,
  geometry: THREE.BufferGeometry | null,
  samplesPerSegment = 8
): THREE.Vector3[] {
  const n = curve.controlPoints.length
  if (n < 2) return curve.controlPoints.map(p => p.clone())

  const catmull = new THREE.CatmullRomCurve3(
    curve.controlPoints,
    curve.closed,
    'centripetal'
  )
  const sampleCount = Math.max(n * samplesPerSegment, 16)
  const points = catmull.getPoints(sampleCount).map(p => p.clone())

  // getPoints su curva chiusa duplica il primo punto in coda
  if (curve.closed && points.length > 1) {
    const first = points[0]
    const last = points[points.length - 1]
    if (first.distanceToSquared(last) < 1e-10) points.pop()
  }

  const bvh = geometry?.boundsTree
  if (bvh) {
    const target = {
      point: new THREE.Vector3(),
      distance: 0,
      faceIndex: 0,
    }
    for (const p of points) {
      const hit = bvh.closestPointToPoint(p, target)
      if (hit) p.copy(hit.point)
    }
  }

  return points
}

/** Ricampiona una polilinea a passo uniforme (mm) */
export function resampleUniform(
  points: THREE.Vector3[],
  spacing: number,
  closed: boolean
): THREE.Vector3[] {
  if (points.length < 2) return points.map(p => p.clone())

  const path = closed ? [...points, points[0]] : points
  let totalLength = 0
  for (let i = 1; i < path.length; i++) {
    totalLength += path[i].distanceTo(path[i - 1])
  }
  if (totalLength < spacing) return points.map(p => p.clone())

  const count = Math.max(Math.round(totalLength / spacing), 8)
  const step = totalLength / count
  const result: THREE.Vector3[] = [path[0].clone()]

  let acc = 0
  let target = step
  for (let i = 1; i < path.length && result.length < count; i++) {
    let segLen = path[i].distanceTo(path[i - 1])
    let segStart = path[i - 1]
    while (acc + segLen >= target && result.length < count) {
      const t = (target - acc) / segLen
      const pt = segStart.clone().lerp(path[i], t)
      result.push(pt)
      // continua dentro lo stesso segmento
      acc = target
      target += step
      const remaining = segStart.clone().lerp(path[i], 1)
      segLen = remaining.distanceTo(pt)
      segStart = pt
    }
    acc += segLen
  }

  return result
}

// ---------------------------------------------------------------------------
// Validazione
// ---------------------------------------------------------------------------

/**
 * Distanza CON SEGNO del punto dalla parete del canale (negativa = dentro il
 * vuoto del tubo), solo dentro l'estensione assiale. La curva non deve
 * attraversare il vuoto della vite; passare vicino alla parete dall'esterno è
 * accettabile (la pipeline clippa comunque i camini all'anatomia).
 */
function signedDistanceToChannelWall(point: THREE.Vector3, channel: ScrewChannel): number {
  const rel = new THREE.Vector3().subVectors(point, channel.bottom)
  const t = rel.dot(channel.axis)
  if (t < -1 || t > channel.height + 1) return Infinity
  const perp = rel.clone().addScaledVector(channel.axis, -t)
  return perp.length() - channel.radius
}

/** Test intersezione segmenti 2D */
function segmentsIntersect2D(
  a1: THREE.Vector2, a2: THREE.Vector2,
  b1: THREE.Vector2, b2: THREE.Vector2
): boolean {
  const d1 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)
  const d2 = (b2.x - b1.x) * (a2.y - b1.y) - (b2.y - b1.y) * (a2.x - b1.x)
  const d3 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x)
  const d4 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/**
 * Valida la curva di split:
 * - chiusa con ≥3 punti di controllo
 * - distanza dai camini ≥ margine (parete camino + tolleranza)
 * - nessuna auto-intersezione nella proiezione ⊥ asse di inserzione
 */
export function validateSplitCurve(
  curve: SplitCurve,
  densified: THREE.Vector3[],
  channels: ScrewChannel[],
  insertionAxis: THREE.Vector3 | null,
  minChannelClearance = 0.3
): CurveValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (curve.controlPoints.length < 3) {
    errors.push('Servono almeno 3 punti di controllo')
  }
  if (!curve.closed) {
    errors.push('La curva deve essere chiusa')
  }

  for (let c = 0; c < channels.length; c++) {
    let minDist = Infinity
    for (const p of densified) {
      const d = signedDistanceToChannelWall(p, channels[c])
      if (d < minDist) minDist = d
    }
    if (minDist < -0.25) {
      // Nettamente dentro il vuoto della vite (i punti curva sono proiettati
      // sulla superficie: qui può arrivarci solo una curva corrotta)
      errors.push(`La curva attraversa il vuoto del canale ${c + 1}`)
    } else if (minDist < minChannelClearance) {
      // Tangente o rasente: tipico dei posteriori inclinati che sbucano al
      // margine — la silhouette segue la parete del tubo. La pipeline clippa
      // i camini all'anatomia e ri-fora, quindi non è bloccante
      warnings.push(`Curva rasente al canale ${c + 1} (${minDist.toFixed(2)}mm dalla parete)`)
    }
  }

  if (insertionAxis && densified.length >= 4 && curve.closed) {
    const axis = insertionAxis.clone().normalize()
    const ref = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const u = new THREE.Vector3().crossVectors(axis, ref).normalize()
    const v = new THREE.Vector3().crossVectors(axis, u).normalize()

    const projected = densified.map(p => new THREE.Vector2(p.dot(u), p.dot(v)))
    const m = projected.length
    let selfIntersects = false
    outer:
    for (let i = 0; i < m; i++) {
      const iNext = (i + 1) % m
      for (let j = i + 2; j < m; j++) {
        const jNext = (j + 1) % m
        if (jNext === i) continue
        if (segmentsIntersect2D(projected[i], projected[iNext], projected[j], projected[jNext])) {
          selfIntersects = true
          break outer
        }
      }
    }
    if (selfIntersects) {
      errors.push('La curva si auto-interseca nella proiezione lungo l\'asse di inserzione')
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// Serializzazione
// ---------------------------------------------------------------------------

export function serializeCurvePoints(points: THREE.Vector3[]): number[][] {
  return points.map(p => [
    Math.round(p.x * 10000) / 10000,
    Math.round(p.y * 10000) / 10000,
    Math.round(p.z * 10000) / 10000,
  ])
}

export function deserializeCurvePoints(data: number[][]): THREE.Vector3[] {
  return data.map(([x, y, z]) => new THREE.Vector3(x, y, z))
}

const CURVE_STORAGE_PREFIX = 'shen3d-split-curve-'

export function saveCurveToStorage(fileName: string, curve: SplitCurve): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      CURVE_STORAGE_PREFIX + fileName,
      JSON.stringify({
        controlPoints: serializeCurvePoints(curve.controlPoints),
        closed: curve.closed,
      })
    )
  } catch {
    // storage pieno o non disponibile: non bloccare l'editor
  }
}

export function loadCurveFromStorage(fileName: string): SplitCurve | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CURVE_STORAGE_PREFIX + fileName)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { controlPoints: number[][]; closed: boolean }
    if (!Array.isArray(parsed.controlPoints)) return null
    return {
      controlPoints: deserializeCurvePoints(parsed.controlPoints),
      closed: !!parsed.closed,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Proposta AI della curva iniziale
// ---------------------------------------------------------------------------

interface Loop {
  points: THREE.Vector3[]
  length: number
  closed: boolean
}

/**
 * Interseca un piano con i triangoli del grafo e concatena i segmenti in loop.
 * Lavora sul grafo (indicizzato per costruzione) perché le geometrie STL
 * non indicizzate non hanno index buffer.
 */
function intersectPlaneWithGraph(
  graph: MeshGraph,
  normal: THREE.Vector3,
  planePoint: THREE.Vector3
): Loop[] {
  const { positions, triangles } = graph
  const constant = -normal.dot(planePoint)
  const plane = new THREE.Plane(normal.clone().normalize(), constant)

  const segments: [THREE.Vector3, THREE.Vector3][] = []
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3()

  for (let t = 0; t < triangles.length; t += 3) {
    vA.fromArray(positions, triangles[t] * 3)
    vB.fromArray(positions, triangles[t + 1] * 3)
    vC.fromArray(positions, triangles[t + 2] * 3)

    const dA = plane.distanceToPoint(vA)
    const dB = plane.distanceToPoint(vB)
    const dC = plane.distanceToPoint(vC)

    const above = (dA > 0 ? 1 : 0) + (dB > 0 ? 1 : 0) + (dC > 0 ? 1 : 0)
    if (above === 0 || above === 3) continue

    const crossings: THREE.Vector3[] = []
    const edges: Array<[THREE.Vector3, number, THREE.Vector3, number]> = [
      [vA, dA, vB, dB],
      [vB, dB, vC, dC],
      [vC, dC, vA, dA],
    ]
    for (const [p1, d1, p2, d2] of edges) {
      if ((d1 > 0 && d2 <= 0) || (d1 <= 0 && d2 > 0)) {
        crossings.push(p1.clone().lerp(p2, d1 / (d1 - d2)))
      }
    }
    if (crossings.length >= 2) {
      segments.push([crossings[0], crossings[1]])
    }
  }

  // Concatena i segmenti in loop (greedy nearest-endpoint)
  const used = new Set<number>()
  const loops: Loop[] = []
  const tol = 1.0

  for (let start = 0; start < segments.length; start++) {
    if (used.has(start)) continue
    used.add(start)
    const chain: THREE.Vector3[] = [segments[start][0].clone(), segments[start][1].clone()]

    let extended = true
    while (extended) {
      extended = false
      const tail = chain[chain.length - 1]
      let bestIdx = -1, bestFlip = false, bestDist = tol
      for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue
        const d0 = tail.distanceTo(segments[i][0])
        const d1 = tail.distanceTo(segments[i][1])
        if (d0 < bestDist) { bestDist = d0; bestIdx = i; bestFlip = false }
        if (d1 < bestDist) { bestDist = d1; bestIdx = i; bestFlip = true }
      }
      if (bestIdx >= 0) {
        used.add(bestIdx)
        chain.push(segments[bestIdx][bestFlip ? 0 : 1].clone())
        extended = true
      }
    }

    let length = 0
    for (let i = 1; i < chain.length; i++) length += chain[i].distanceTo(chain[i - 1])
    const closed = chain.length > 3 && chain[0].distanceTo(chain[chain.length - 1]) < 2.5
    loops.push({ points: chain, length, closed })
  }

  return loops
}

export interface ProposeCurveInput {
  graph: MeshGraph
  channels: ScrewChannel[]
  insertionAxis: THREE.Vector3 | null
  geometry: THREE.BufferGeometry | null
  /** Offset lungo l'asse sopra la mediana dei rim intaglio (mm) */
  heightOffset?: number
  /** Numero di punti di controllo della curva proposta */
  controlPointCount?: number
  /** Curvatura per vertice unico, se già calcolata */
  curvaturePerUnique?: Float32Array
}

/**
 * Propone la curva di split iniziale:
 * 1. piano ⊥ asse di inserzione a quota mediana(rim intaglio) + offset
 * 2. silhouette chiusa più lunga (bordo esterno della protesi)
 * 3. snap verticale di ogni punto alla banda di alta curvatura vicina
 *    (solco gengiva/dente), poi riproiezione sulla superficie
 */
export function proposeSplitCurve(input: ProposeCurveInput): SplitCurve | null {
  const { graph, channels, geometry } = input
  const heightOffset = input.heightOffset ?? 4
  const controlPointCount = input.controlPointCount ?? 24

  const axis = (input.insertionAxis ?? new THREE.Vector3(0, 1, 0)).clone().normalize()

  // Quota del piano: mediana delle quote dei fondi canale (lato intaglio)
  let planePoint: THREE.Vector3
  if (channels.length > 0) {
    const heights = channels
      .map(ch => ch.bottom.dot(axis))
      .sort((a, b) => a - b)
    const median = heights[Math.floor(heights.length / 2)]
    planePoint = axis.clone().multiplyScalar(median + heightOffset)
  } else {
    // Fallback: terzo inferiore del bounding box lungo l'asse
    let minT = Infinity, maxT = -Infinity
    const p = new THREE.Vector3()
    for (let i = 0; i < graph.uniqueCount; i++) {
      p.fromArray(graph.positions, i * 3)
      const t = p.dot(axis)
      if (t < minT) minT = t
      if (t > maxT) maxT = t
    }
    planePoint = axis.clone().multiplyScalar(minT + (maxT - minT) * 0.35)
  }

  const loops = intersectPlaneWithGraph(graph, axis, planePoint)
  if (loops.length === 0) return null

  // Silhouette esterna = loop chiuso più lungo (i loop interni sono i camini)
  const closedLoops = loops.filter(l => l.closed)
  const pool = closedLoops.length > 0 ? closedLoops : loops
  const outer = pool.reduce((a, b) => (a.length >= b.length ? a : b))
  if (outer.points.length < 8) return null

  // Downsample a N punti di controllo
  const resampled = resampleUniform(outer.points, outer.length / controlPointCount, true)
  let controls = resampled.slice(0, controlPointCount)

  // Snap alla banda di alta curvatura: cerca vicino a ogni punto (entro 1.5mm
  // laterali e ±2.5mm assiali) il vertice con curvatura più alta
  const curvature = input.curvaturePerUnique ?? computeCurvatureFromGraph(graph)
  const sorted = Float32Array.from(curvature).sort()
  const creaseThreshold = sorted[Math.floor(sorted.length * 0.75)]

  const cellSize = 2.5
  const grid = new Map<string, number[]>()
  const keyOf = (x: number, y: number, z: number) =>
    `${Math.floor(x / cellSize)}_${Math.floor(y / cellSize)}_${Math.floor(z / cellSize)}`
  const vert = new THREE.Vector3()
  const rel = new THREE.Vector3()
  // Le creste dei rim dei camini NON sono target di snap: attirerebbero la
  // curva dentro i canali
  const nearChannel = (p: THREE.Vector3): boolean => {
    for (const ch of channels) {
      rel.subVectors(p, ch.bottom)
      const t = rel.dot(ch.axis)
      if (t < -2 || t > ch.height + 2) continue
      const perp = rel.clone().addScaledVector(ch.axis, -t)
      if (perp.length() < ch.radius + 1.5) return true
    }
    return false
  }
  for (let i = 0; i < graph.uniqueCount; i++) {
    if (curvature[i] <= creaseThreshold) continue
    const x = graph.positions[i * 3], y = graph.positions[i * 3 + 1], z = graph.positions[i * 3 + 2]
    vert.set(x, y, z)
    if (nearChannel(vert)) continue
    const key = keyOf(x, y, z)
    let arr = grid.get(key)
    if (!arr) { arr = []; grid.set(key, arr) }
    arr.push(i)
  }

  controls = controls.map(cp => {
    const cx = Math.floor(cp.x / cellSize), cy = Math.floor(cp.y / cellSize), cz = Math.floor(cp.z / cellSize)
    let best: THREE.Vector3 | null = null
    let bestScore = 0
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const arr = grid.get(`${cx + dx}_${cy + dy}_${cz + dz}`)
          if (!arr) continue
          for (const i of arr) {
            vert.fromArray(graph.positions, i * 3)
            rel.subVectors(vert, cp)
            const axial = Math.abs(rel.dot(axis))
            if (axial > 2.5) continue
            const lateral = Math.sqrt(Math.max(rel.lengthSq() - axial * axial, 0))
            if (lateral > 1.5) continue
            const score = curvature[i] / (0.5 + lateral)
            if (score > bestScore) {
              bestScore = score
              best = vert.clone()
            }
          }
        }
      }
    }
    return best ?? cp
  })

  // Riproiezione sulla superficie
  const bvh = geometry?.boundsTree
  const reproject = (pts: THREE.Vector3[]) => {
    if (!bvh) return
    const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 }
    for (const p of pts) {
      const hit = bvh.closestPointToPoint(p, target)
      if (hit) p.copy(hit.point)
    }
  }
  reproject(controls)

  // Enforcement clearance dai camini: se un punto entra nel vuoto del canale
  // o rasenta la parete (succede coi posteriori inclinati), spingilo
  // radialmente verso l'esterno e riproietta sulla superficie
  const proposalClearance = 0.9
  for (let iter = 0; iter < 3; iter++) {
    let moved = false
    for (const p of controls) {
      for (const ch of channels) {
        rel.subVectors(p, ch.bottom)
        const t = rel.dot(ch.axis)
        if (t < -1 || t > ch.height + 1) continue
        const perp = rel.clone().addScaledVector(ch.axis, -t)
        const perpLen = perp.length()
        if (perpLen - ch.radius >= proposalClearance) continue
        // Direzione radiale di fuga (fallback se il punto è sull'asse)
        const dir = perpLen > 1e-6
          ? perp.multiplyScalar(1 / perpLen)
          : new THREE.Vector3().crossVectors(ch.axis, axis).normalize()
        p.copy(ch.bottom)
          .addScaledVector(ch.axis, t)
          .addScaledVector(dir, ch.radius + proposalClearance + 0.3)
        moved = true
      }
    }
    if (!moved) break
    reproject(controls)
  }

  // La Catmull densificata può "tagliare l'angolo" rientrando verso il canale
  // anche con punti di controllo liberi: verifica sui campioni densificati e
  // spingi più forte il punto di controllo più vicino alla violazione
  for (let iter = 0; iter < 5; iter++) {
    const densified = densifySplitCurve({ controlPoints: controls, closed: true }, geometry ?? null)
    let worst: { sample: THREE.Vector3; channel: ScrewChannel } | null = null
    let worstDist = 0.45 // margine sopra la clearance di validazione (0.3)
    for (const sample of densified) {
      for (const ch of channels) {
        rel.subVectors(sample, ch.bottom)
        const t = rel.dot(ch.axis)
        if (t < -1 || t > ch.height + 1) continue
        const perp = rel.clone().addScaledVector(ch.axis, -t)
        const signed = perp.length() - ch.radius
        if (signed < worstDist) {
          worstDist = signed
          worst = { sample: sample.clone(), channel: ch }
        }
      }
    }
    if (!worst) break

    // Punto di controllo più vicino alla violazione → spinto radialmente fuori
    let nearestIdx = 0
    let nearestD = Infinity
    for (let i = 0; i < controls.length; i++) {
      const d = controls[i].distanceToSquared(worst.sample)
      if (d < nearestD) {
        nearestD = d
        nearestIdx = i
      }
    }
    const cp = controls[nearestIdx]
    const ch = worst.channel
    rel.subVectors(cp, ch.bottom)
    const t = rel.dot(ch.axis)
    const perp = rel.clone().addScaledVector(ch.axis, -t)
    const dir = perp.length() > 1e-6
      ? perp.normalize()
      : new THREE.Vector3().crossVectors(ch.axis, axis).normalize()
    cp.copy(ch.bottom)
      .addScaledVector(ch.axis, THREE.MathUtils.clamp(t, 0, ch.height))
      .addScaledVector(dir, ch.radius + 0.7 + iter * 0.3)
    reproject(controls)
  }

  return { controlPoints: controls, closed: true }
}
