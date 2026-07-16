import * as THREE from 'three'
import { MeshGraph } from './mesh-graph'
import { computeCurvatureFromGraph } from './curvature'

/**
 * Rilevamento dei camini vite (canali di accesso alle viti implantari) da una
 * protesi ibrida monolitica watertight.
 *
 * I camini sono tubi cavi interni alla mesh: si manifestano come coppie di
 * bordi circolari netti (rim occlusale + rim intaglio) collegati da una parete
 * cilindrica. Strategia:
 *  1. vertici ad alta curvatura → clustering spaziale → candidati rim
 *  2. fit cerchio per cluster (PCA piano + fit algebrico di Kåsa)
 *  3. accoppiamento rim allineati → canale iniziale
 *  4. raffinamento asse via covarianza delle normali della parete del tubo
 *  5. validazione raycast radiale (BVH) → confidenza
 */

export interface ScrewChannel {
  id: string
  center: THREE.Vector3
  /** Asse unitario, orientato coerentemente con gli altri canali */
  axis: THREE.Vector3
  radius: number
  height: number
  top: THREE.Vector3
  bottom: THREE.Vector3
  confidence: number
  source: 'auto' | 'manual'
}

export interface RimCircle {
  center: THREE.Vector3
  normal: THREE.Vector3
  radius: number
  residual: number
  pointCount: number
}

export interface ChannelDetectionOptions {
  minRadius: number
  maxRadius: number
  minChannelHeight: number
  maxChannelHeight: number
  curvaturePercentile: number
  clusterEps: number
  clusterMinPts: number
  maxChannels: number
}

export const DEFAULT_CHANNEL_OPTIONS: ChannelDetectionOptions = {
  minRadius: 0.8,
  maxRadius: 3.5,
  minChannelHeight: 3,
  maxChannelHeight: 30,
  curvaturePercentile: 0.88,
  clusterEps: 0.8,
  clusterMinPts: 8,
  maxChannels: 12,
}

// ---------------------------------------------------------------------------
// Utility numeriche
// ---------------------------------------------------------------------------

type Mat3 = [number, number, number, number, number, number, number, number, number]

/**
 * Autovettori/autovalori di una matrice 3x3 simmetrica (metodo di Jacobi).
 * Ritorna { values, vectors } con values crescenti e vectors colonne unitarie.
 */
export function jacobiEigen3(m: Mat3): { values: [number, number, number]; vectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3] } {
  const a = [
    [m[0], m[1], m[2]],
    [m[3], m[4], m[5]],
    [m[6], m[7], m[8]],
  ]
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]

  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q]
    }
    if (off < 1e-18) break

    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c

        for (let k = 0; k < 3; k++) {
          const akp = a[k][p], akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k], aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p], vkq = v[k][q]
          v[k][p] = c * vkp - s * vkq
          v[k][q] = s * vkp + c * vkq
        }
      }
    }
  }

  const entries: Array<{ value: number; vector: THREE.Vector3 }> = [0, 1, 2].map(i => ({
    value: a[i][i],
    vector: new THREE.Vector3(v[0][i], v[1][i], v[2][i]).normalize(),
  }))
  entries.sort((x, y) => x.value - y.value)

  return {
    values: [entries[0].value, entries[1].value, entries[2].value],
    vectors: [entries[0].vector, entries[1].vector, entries[2].vector],
  }
}

/**
 * Fit algebrico di un cerchio 2D (metodo di Kåsa).
 * Ritorna centro, raggio e residuo RMS.
 */
export function fitCircle2D(xs: number[], ys: number[]): { cx: number; cy: number; r: number; residual: number } | null {
  const n = xs.length
  if (n < 3) return null

  // Sistema: minimizza sum((x²+y²) - 2cx·x - 2cy·y - d)²
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0
  let sxz = 0, syz = 0, sz = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i]
    const z = x * x + y * y
    sxx += x * x; sxy += x * y; syy += y * y
    sx += x; sy += y
    sxz += x * z; syz += y * z; sz += z
  }

  // Risolvi [sxx sxy sx; sxy syy sy; sx sy n] · [2cx, 2cy, d] = [sxz, syz, sz]
  const A = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ]
  const b = [sxz, syz, sz]

  // Eliminazione gaussiana 3x3 con pivoting parziale
  for (let col = 0; col < 3; col++) {
    let pivot = col
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row
    }
    if (Math.abs(A[pivot][col]) < 1e-12) return null
    if (pivot !== col) {
      [A[col], A[pivot]] = [A[pivot], A[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]]
    }
    for (let row = col + 1; row < 3; row++) {
      const f = A[row][col] / A[col][col]
      for (let k = col; k < 3; k++) A[row][k] -= f * A[col][k]
      b[row] -= f * b[col]
    }
  }
  const sol = [0, 0, 0]
  for (let row = 2; row >= 0; row--) {
    let acc = b[row]
    for (let k = row + 1; k < 3; k++) acc -= A[row][k] * sol[k]
    sol[row] = acc / A[row][row]
  }

  const cx = sol[0] / 2
  const cy = sol[1] / 2
  const rSq = sol[2] + cx * cx + cy * cy
  if (rSq <= 0) return null
  const r = Math.sqrt(rSq)

  let sumSq = 0
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(xs[i] - cx, ys[i] - cy) - r
    sumSq += d * d
  }
  return { cx, cy, r, residual: Math.sqrt(sumSq / n) }
}

/** Clustering DBSCAN su griglia spaziale (eps = lato cella) */
export function clusterPoints(
  points: Float32Array,
  indices: number[],
  eps: number,
  minPts: number
): number[][] {
  const cell = new Map<string, number[]>()
  const keyOf = (x: number, y: number, z: number) =>
    `${Math.floor(x / eps)}_${Math.floor(y / eps)}_${Math.floor(z / eps)}`

  for (const idx of indices) {
    const key = keyOf(points[idx * 3], points[idx * 3 + 1], points[idx * 3 + 2])
    let arr = cell.get(key)
    if (!arr) {
      arr = []
      cell.set(key, arr)
    }
    arr.push(idx)
  }

  const epsSq = eps * eps
  const visited = new Set<number>()
  const clusters: number[][] = []

  const neighborsOf = (idx: number): number[] => {
    const x = points[idx * 3], y = points[idx * 3 + 1], z = points[idx * 3 + 2]
    const cx = Math.floor(x / eps), cy = Math.floor(y / eps), cz = Math.floor(z / eps)
    const result: number[] = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const arr = cell.get(`${cx + dx}_${cy + dy}_${cz + dz}`)
          if (!arr) continue
          for (const j of arr) {
            const ddx = points[j * 3] - x
            const ddy = points[j * 3 + 1] - y
            const ddz = points[j * 3 + 2] - z
            if (ddx * ddx + ddy * ddy + ddz * ddz <= epsSq) result.push(j)
          }
        }
      }
    }
    return result
  }

  for (const idx of indices) {
    if (visited.has(idx)) continue
    visited.add(idx)
    const seeds = neighborsOf(idx)
    if (seeds.length < minPts) continue

    const cluster: number[] = [idx]
    const queue = seeds.filter(s => s !== idx)
    while (queue.length > 0) {
      const cur = queue.pop()!
      if (visited.has(cur)) continue
      visited.add(cur)
      cluster.push(cur)
      const curNeighbors = neighborsOf(cur)
      if (curNeighbors.length >= minPts) {
        for (const nb of curNeighbors) {
          if (!visited.has(nb)) queue.push(nb)
        }
      }
    }
    clusters.push(cluster)
  }

  return clusters
}

// ---------------------------------------------------------------------------
// Fit dei rim (bordi circolari dei camini)
// ---------------------------------------------------------------------------

function fitRimFromCluster(
  graph: MeshGraph,
  cluster: number[],
  opts: ChannelDetectionOptions
): RimCircle | null {
  const n = cluster.length
  if (n < opts.clusterMinPts || n > 8000) return null
  const { positions } = graph

  const centroid = new THREE.Vector3()
  for (const idx of cluster) {
    centroid.x += positions[idx * 3]
    centroid.y += positions[idx * 3 + 1]
    centroid.z += positions[idx * 3 + 2]
  }
  centroid.divideScalar(n)

  // PCA delle posizioni → piano del rim (normale = autovettore minimo)
  let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0
  for (const idx of cluster) {
    const dx = positions[idx * 3] - centroid.x
    const dy = positions[idx * 3 + 1] - centroid.y
    const dz = positions[idx * 3 + 2] - centroid.z
    cxx += dx * dx; cxy += dx * dy; cxz += dx * dz
    cyy += dy * dy; cyz += dy * dz; czz += dz * dz
  }
  const eig = jacobiEigen3([cxx, cxy, cxz, cxy, cyy, cyz, cxz, cyz, czz])
  const normal = eig.vectors[0]
  const e1 = eig.vectors[2]
  const e2 = eig.vectors[1]

  // Planarità: rms distanza dal piano
  let planeSq = 0
  const xs: number[] = []
  const ys: number[] = []
  const tmp = new THREE.Vector3()
  for (const idx of cluster) {
    tmp.set(
      positions[idx * 3] - centroid.x,
      positions[idx * 3 + 1] - centroid.y,
      positions[idx * 3 + 2] - centroid.z
    )
    const dPlane = tmp.dot(normal)
    planeSq += dPlane * dPlane
    xs.push(tmp.dot(e1))
    ys.push(tmp.dot(e2))
  }
  const planeRms = Math.sqrt(planeSq / n)
  if (planeRms > 0.6) return null

  const circle = fitCircle2D(xs, ys)
  if (!circle) return null
  if (circle.r < opts.minRadius || circle.r > opts.maxRadius) return null
  if (circle.residual > 0.2) return null

  // Copertura angolare: un rim vero copre quasi tutto il cerchio,
  // una cresta casuale solo un arco
  const bins = new Array(12).fill(0)
  for (let i = 0; i < n; i++) {
    const angle = Math.atan2(ys[i] - circle.cy, xs[i] - circle.cx)
    bins[Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 12) % 12]++
  }
  const coveredBins = bins.filter(b => b > 0).length
  if (coveredBins < 7) return null

  const center = centroid.clone()
    .add(e1.clone().multiplyScalar(circle.cx))
    .add(e2.clone().multiplyScalar(circle.cy))

  return {
    center,
    normal,
    radius: circle.r,
    residual: circle.residual,
    pointCount: n,
  }
}

// ---------------------------------------------------------------------------
// Raffinamento cilindro dalla parete del tubo
// ---------------------------------------------------------------------------

interface CylinderFit {
  center: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  top: THREE.Vector3
  bottom: THREE.Vector3
  height: number
  inlierCount: number
}

/**
 * Raffina un cilindro raccogliendo i vertici della parete del tubo.
 * L'asse è l'autovettore con autovalore minimo della covarianza delle normali:
 * le normali di una parete cilindrica giacciono nel piano ortogonale all'asse.
 */
function refineCylinder(
  graph: MeshGraph,
  initialAxis: THREE.Vector3,
  initialBottom: THREE.Vector3,
  initialTop: THREE.Vector3,
  initialRadius: number,
  iterations = 2
): CylinderFit | null {
  const { positions, normals, uniqueCount } = graph
  let axis = initialAxis.clone().normalize()
  let bottom = initialBottom.clone()
  let radius = initialRadius
  let height = initialTop.distanceTo(initialBottom)

  const p = new THREE.Vector3()
  const rel = new THREE.Vector3()
  const perp = new THREE.Vector3()

  let result: CylinderFit | null = null

  for (let iter = 0; iter < iterations; iter++) {
    const wall: number[] = []
    const radialTol = 0.4
    const axialMargin = 0.5

    for (let i = 0; i < uniqueCount; i++) {
      p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      rel.subVectors(p, bottom)
      const t = rel.dot(axis)
      if (t < -axialMargin || t > height + axialMargin) continue
      perp.copy(rel).addScaledVector(axis, -t)
      const d = perp.length()
      if (Math.abs(d - radius) <= radialTol) wall.push(i)
    }

    if (wall.length < 40) return result

    // Covarianza delle normali dei vertici della parete
    let nxx = 0, nxy = 0, nxz = 0, nyy = 0, nyz = 0, nzz = 0
    for (const i of wall) {
      const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2]
      nxx += nx * nx; nxy += nx * ny; nxz += nx * nz
      nyy += ny * ny; nyz += ny * nz; nzz += nz * nz
    }
    const eig = jacobiEigen3([nxx, nxy, nxz, nxy, nyy, nyz, nxz, nyz, nzz])
    const newAxis = eig.vectors[0]
    if (newAxis.dot(axis) < 0) newAxis.negate()
    axis = newAxis

    // Ricalcola centro assiale, raggio e quota top/bottom
    const centroid = new THREE.Vector3()
    for (const i of wall) {
      centroid.x += positions[i * 3]
      centroid.y += positions[i * 3 + 1]
      centroid.z += positions[i * 3 + 2]
    }
    centroid.divideScalar(wall.length)

    let tMin = Infinity, tMax = -Infinity
    let radiusSum = 0
    // Centro radiale: media dei punti proiettati sul piano ⊥ asse,
    // spostata verso l'interno — per un tubo completo la media È il centro
    const planar = new THREE.Vector3()
    for (const i of wall) {
      p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      rel.subVectors(p, centroid)
      const t = rel.dot(axis)
      if (t < tMin) tMin = t
      if (t > tMax) tMax = t
      perp.copy(rel).addScaledVector(axis, -t)
      planar.add(perp)
    }
    planar.divideScalar(wall.length)
    const axisPoint = centroid.clone().add(planar)

    for (const i of wall) {
      p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      rel.subVectors(p, axisPoint)
      const t = rel.dot(axis)
      perp.copy(rel).addScaledVector(axis, -t)
      radiusSum += perp.length()
    }

    radius = radiusSum / wall.length
    height = tMax - tMin
    bottom = axisPoint.clone().addScaledVector(axis, tMin)
    const top = axisPoint.clone().addScaledVector(axis, tMax)

    result = {
      center: axisPoint.clone().addScaledVector(axis, (tMin + tMax) / 2),
      axis: axis.clone(),
      radius,
      top,
      bottom,
      height,
      inlierCount: wall.length,
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Validazione raycast radiale
// ---------------------------------------------------------------------------

/**
 * Dal centro del canale lancia raggi radiali ⊥ asse: in un tubo vero la prima
 * superficie colpita è la parete interna a distanza ≈ raggio.
 * Ritorna la frazione di raggi coerenti (0..1).
 */
function validateChannelRadially(
  geometry: THREE.BufferGeometry,
  channel: CylinderFit
): number {
  const bvh = geometry.boundsTree
  if (!bvh) return 0.5

  const { axis, center, radius } = channel
  const ref = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(axis, ref).normalize()
  const v = new THREE.Vector3().crossVectors(axis, u).normalize()

  const ray = new THREE.Ray()
  let good = 0
  const nRays = 8
  for (let k = 0; k < nRays; k++) {
    const angle = (k / nRays) * Math.PI * 2
    const dir = u.clone().multiplyScalar(Math.cos(angle))
      .add(v.clone().multiplyScalar(Math.sin(angle)))
    ray.origin.copy(center)
    ray.direction.copy(dir)
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide)
    if (hit && Math.abs(hit.distance - radius) < 0.35) good++
  }
  return good / nRays
}

// ---------------------------------------------------------------------------
// Pipeline principale
// ---------------------------------------------------------------------------

export function detectScrewChannels(
  geometry: THREE.BufferGeometry,
  graph: MeshGraph,
  curvaturePerUnique?: Float32Array,
  options?: Partial<ChannelDetectionOptions>
): ScrewChannel[] {
  const opts = { ...DEFAULT_CHANNEL_OPTIONS, ...options }
  const curvature = curvaturePerUnique ?? computeCurvatureFromGraph(graph)

  // 1. Vertici ad alta curvatura (creste: rim dei camini + solchi anatomici)
  const sorted = Float32Array.from(curvature).sort()
  const threshold = sorted[Math.floor(sorted.length * opts.curvaturePercentile)]
  const candidates: number[] = []
  for (let i = 0; i < curvature.length; i++) {
    if (curvature[i] > threshold) candidates.push(i)
  }

  // 2. Clustering spaziale
  const clusters = clusterPoints(graph.positions, candidates, opts.clusterEps, opts.clusterMinPts)

  // 3. Fit cerchio per cluster → rim candidati
  const rims: RimCircle[] = []
  for (const cluster of clusters) {
    const rim = fitRimFromCluster(graph, cluster, opts)
    if (rim) rims.push(rim)
  }

  // 4. Accoppiamento rim → canali iniziali
  interface Pair { i: number; j: number; score: number }
  const pairs: Pair[] = []
  for (let i = 0; i < rims.length; i++) {
    for (let j = i + 1; j < rims.length; j++) {
      const a = rims[i], b = rims[j]
      const between = new THREE.Vector3().subVectors(b.center, a.center)
      const dist = between.length()
      if (dist < opts.minChannelHeight || dist > opts.maxChannelHeight) continue
      const dir = between.clone().normalize()
      const alignA = Math.abs(dir.dot(a.normal))
      const alignB = Math.abs(dir.dot(b.normal))
      if (alignA < 0.7 || alignB < 0.7) continue
      if (Math.abs(a.radius - b.radius) > 1.2) continue
      const score = (alignA + alignB) / (1 + a.residual + b.residual)
      pairs.push({ i, j, score })
    }
  }
  pairs.sort((a, b) => b.score - a.score)

  const usedRims = new Set<number>()
  const channels: ScrewChannel[] = []

  for (const pair of pairs) {
    if (usedRims.has(pair.i) || usedRims.has(pair.j)) continue
    const a = rims[pair.i], b = rims[pair.j]

    const axis = new THREE.Vector3().subVectors(b.center, a.center).normalize()
    const radius = (a.radius + b.radius) / 2

    // 5. Raffinamento dalla parete del tubo
    const refined = refineCylinder(graph, axis, a.center, b.center, radius)
    if (!refined) continue
    if (refined.radius < opts.minRadius || refined.radius > opts.maxRadius) continue
    if (refined.height < opts.minChannelHeight) continue

    // 6. Validazione radiale
    const rayScore = validateChannelRadially(geometry, refined)
    if (rayScore < 0.5) continue

    usedRims.add(pair.i)
    usedRims.add(pair.j)

    channels.push({
      id: `channel-${channels.length}`,
      center: refined.center,
      axis: refined.axis,
      radius: refined.radius,
      height: refined.height,
      top: refined.top,
      bottom: refined.bottom,
      confidence: Math.min(1, rayScore * (0.6 + Math.min(refined.inlierCount / 2000, 0.4))),
      source: 'auto',
    })

    if (channels.length >= opts.maxChannels) break
  }

  // 7. Dedup spaziale e orientazione coerente degli assi
  const deduped: ScrewChannel[] = []
  for (const ch of channels.sort((x, y) => y.confidence - x.confidence)) {
    if (deduped.some(d => d.center.distanceTo(ch.center) < 2)) continue
    deduped.push(ch)
  }

  orientChannelsConsistently(deduped)
  deduped.forEach((ch, i) => { ch.id = `channel-${i}` })
  return deduped
}

/** Allinea i segni degli assi (voto di maggioranza sull'asse medio) */
export function orientChannelsConsistently(channels: ScrewChannel[]): void {
  if (channels.length === 0) return
  const reference = channels[0].axis.clone()
  const mean = new THREE.Vector3()
  for (const ch of channels) {
    mean.add(ch.axis.dot(reference) >= 0 ? ch.axis : ch.axis.clone().negate())
  }
  mean.normalize()
  for (const ch of channels) {
    if (ch.axis.dot(mean) < 0) {
      ch.axis.negate()
      const oldTop = ch.top
      ch.top = ch.bottom
      ch.bottom = oldTop
    }
  }
}

/** Asse di inserzione di default: media degli assi dei canali */
export function computeInsertionAxis(channels: ScrewChannel[]): THREE.Vector3 | null {
  if (channels.length === 0) return null
  const mean = new THREE.Vector3()
  for (const ch of channels) mean.add(ch.axis)
  if (mean.lengthSq() < 1e-9) return channels[0].axis.clone()
  return mean.normalize()
}

/**
 * Fit manuale: l'utente clicca un punto dentro/vicino a un camino non rilevato.
 * Si parte dai vertici vicini al click e si raffina il cilindro localmente.
 */
export function fitChannelFromSeed(
  geometry: THREE.BufferGeometry,
  graph: MeshGraph,
  seedPoint: THREE.Vector3,
  options?: Partial<ChannelDetectionOptions>
): ScrewChannel | null {
  const opts = { ...DEFAULT_CHANNEL_OPTIONS, ...options }
  const { positions, normals, uniqueCount } = graph

  // Vertici entro 5mm dal click
  const nearby: number[] = []
  const p = new THREE.Vector3()
  for (let i = 0; i < uniqueCount; i++) {
    p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
    if (p.distanceToSquared(seedPoint) < 25) nearby.push(i)
  }
  if (nearby.length < 40) return null

  // Asse iniziale dalla covarianza delle normali locali
  let nxx = 0, nxy = 0, nxz = 0, nyy = 0, nyz = 0, nzz = 0
  for (const i of nearby) {
    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2]
    nxx += nx * nx; nxy += nx * ny; nxz += nx * nz
    nyy += ny * ny; nyz += ny * nz; nzz += nz * nz
  }
  const eig = jacobiEigen3([nxx, nxy, nxz, nxy, nyy, nyz, nxz, nyz, nzz])
  const axis = eig.vectors[0]

  // Raggio iniziale: mediana delle distanze radiali dal seed
  const dists: number[] = []
  const rel = new THREE.Vector3()
  const perp = new THREE.Vector3()
  for (const i of nearby) {
    p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
    rel.subVectors(p, seedPoint)
    const t = rel.dot(axis)
    perp.copy(rel).addScaledVector(axis, -t)
    dists.push(perp.length())
  }
  dists.sort((a, b) => a - b)
  const radius = dists[Math.floor(dists.length / 2)]
  if (radius < opts.minRadius * 0.5 || radius > opts.maxRadius * 1.5) return null

  const bottom = seedPoint.clone().addScaledVector(axis, -8)
  const top = seedPoint.clone().addScaledVector(axis, 8)
  const refined = refineCylinder(graph, axis, bottom, top, radius, 3)
  if (!refined) return null
  if (refined.radius < opts.minRadius || refined.radius > opts.maxRadius) return null
  if (refined.height < opts.minChannelHeight) return null

  const rayScore = validateChannelRadially(geometry, refined)

  return {
    id: `channel-manual-${Date.now()}`,
    center: refined.center,
    axis: refined.axis,
    radius: refined.radius,
    height: refined.height,
    top: refined.top,
    bottom: refined.bottom,
    confidence: Math.max(0.3, rayScore * 0.8),
    source: 'manual',
  }
}
