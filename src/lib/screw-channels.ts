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

export function fitRimFromCluster(
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

export interface CylinderFit {
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
 *
 * Robustezze per canali reali (validate su ponti All-on-X):
 * - filtro per normale ~⊥ asse: esclude le superfici occlusali piatte attorno
 *   al foro d'accesso che altrimenti dominano la covarianza e ribaltano l'asse
 * - finestra assiale espansa a ogni iterazione: la coppia di rim iniziale può
 *   coprire solo un tratto (sede+tubo), il canale reale è più lungo
 * - raggio = banda dominante dell'istogramma delle distanze radiali: i canali
 *   implantari hanno gradini (counterbore) e taper, la media pura è sbagliata
 */
export function refineCylinder(
  graph: MeshGraph,
  initialAxis: THREE.Vector3,
  initialBottom: THREE.Vector3,
  initialTop: THREE.Vector3,
  tubeRadius: number,
  iterations = 3
): CylinderFit | null {
  const { positions, normals, uniqueCount } = graph
  let axis = initialAxis.clone().normalize()
  let anchor = initialBottom.clone().add(initialTop).multiplyScalar(0.5)
  const initialHalf = Math.max(initialTop.distanceTo(initialBottom) / 2, 0.5)
  let tMinW = -initialHalf
  let tMaxW = +initialHalf
  let radius = tubeRadius

  const p = new THREE.Vector3()
  const rel = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const nrm = new THREE.Vector3()

  let result: CylinderFit | null = null

  for (let iter = 0; iter < iterations; iter++) {
    // Finestra assiale espansa simmetricamente: il canale può estendersi
    // oltre i rim iniziali (la coppia sede+tubo copre solo un tratto)
    const axialLo = tMinW - 6.0
    const axialHi = tMaxW + 6.0
    const radialTol = 0.35

    const wall: number[] = []
    for (let i = 0; i < uniqueCount; i++) {
      nrm.set(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2])
      // Solo pareti ~cilindriche: esclude superfici occlusali piatte e cap
      if (Math.abs(nrm.dot(axis)) > 0.45) continue
      p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      rel.subVectors(p, anchor)
      const t = rel.dot(axis)
      if (t < axialLo || t > axialHi) continue
      perp.copy(rel).addScaledVector(axis, -t)
      // Solo la banda del tubo: il raggio è noto dal rim, NON va ristimato
      // dall'istogramma (counterbore/anatomia lo rendono instabile)
      if (Math.abs(perp.length() - radius) > radialTol) continue
      wall.push(i)
    }

    if (wall.length < 40) return result

    // Covarianza delle normali della parete → asse = autovettore minimo
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

    // Centro: media delle proiezioni ⊥ asse (per un tubo completo È l'asse)
    const centroid = new THREE.Vector3()
    for (const i of wall) {
      centroid.x += positions[i * 3]
      centroid.y += positions[i * 3 + 1]
      centroid.z += positions[i * 3 + 2]
    }
    centroid.divideScalar(wall.length)

    const planar = new THREE.Vector3()
    for (const i of wall) {
      p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      rel.subVectors(p, centroid)
      const t = rel.dot(axis)
      perp.copy(rel).addScaledVector(axis, -t)
      planar.add(perp)
    }
    planar.divideScalar(wall.length)
    const axisPoint = centroid.clone().add(planar)

    // Raggio ed estensione della banda del tubo
    let tMin = Infinity, tMax = -Infinity
    let radiusSum = 0
    for (const i of wall) {
      p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
      rel.subVectors(p, axisPoint)
      const t = rel.dot(axis)
      if (t < tMin) tMin = t
      if (t > tMax) tMax = t
      perp.copy(rel).addScaledVector(axis, -t)
      radiusSum += perp.length()
    }

    radius = radiusSum / wall.length
    const height = tMax - tMin
    const bottom = axisPoint.clone().addScaledVector(axis, tMin)
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

    anchor = result.center.clone()
    tMinW = -height / 2
    tMaxW = +height / 2
  }

  return result
}

// ---------------------------------------------------------------------------
// Validazione raycast radiale
// ---------------------------------------------------------------------------

/**
 * Lancia raggi radiali ⊥ asse a 3 quote (25/50/75% dell'altezza): dentro un
 * tubo vero la prima superficie colpita è vicina (≈ raggio, con tolleranza per
 * taper e counterbore). Ritorna la frazione di raggi coerenti (0..1).
 */
export function validateChannelRadially(
  geometry: THREE.BufferGeometry,
  channel: CylinderFit
): number {
  const bvh = geometry.boundsTree
  if (!bvh) return 0.5

  const { axis, bottom, radius, height } = channel
  const ref = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(axis, ref).normalize()
  const v = new THREE.Vector3().crossVectors(axis, u).normalize()

  const ray = new THREE.Ray()
  const nRays = 8
  let good = 0
  let total = 0
  for (const frac of [0.25, 0.5, 0.75]) {
    const origin = bottom.clone().addScaledVector(axis, height * frac)
    for (let k = 0; k < nRays; k++) {
      const angle = (k / nRays) * Math.PI * 2
      const dir = u.clone().multiplyScalar(Math.cos(angle))
        .add(v.clone().multiplyScalar(Math.sin(angle)))
      ray.origin.copy(origin)
      ray.direction.copy(dir)
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide)
      total++
      // dentro un tubo: prima parete vicina (counterbore/taper tollerati)
      if (hit && hit.distance > radius * 0.3 && hit.distance < radius * 2.5 + 0.5) good++
    }
  }
  return total > 0 ? good / total : 0
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

  // 4. Raggruppamento dei rim per coassialità (union-find).
  //    NIENTE vincolo di similarità dei raggi: i canali implantari reali hanno
  //    gradini (counterbore della sede + tubo + accesso occlusale) — lo stesso
  //    sito produce 2-3 rim coassiali con raggi diversi.
  const parent = rims.map((_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }

  for (let i = 0; i < rims.length; i++) {
    for (let j = i + 1; j < rims.length; j++) {
      const a = rims[i], b = rims[j]
      const between = new THREE.Vector3().subVectors(b.center, a.center)
      const dist = between.length()
      // Separazione assiale minima 1.5mm: sede e tubo sono vicini
      if (dist < 1.5 || dist > opts.maxChannelHeight) continue
      const dir = between.clone().normalize()
      // Coassiali: la retta tra i centri è ~parallela a entrambe le normali
      if (Math.abs(dir.dot(a.normal)) < 0.75) continue
      if (Math.abs(dir.dot(b.normal)) < 0.75) continue
      parent[find(i)] = find(j)
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < rims.length; i++) {
    const root = find(i)
    let arr = groups.get(root)
    if (!arr) {
      arr = []
      groups.set(root, arr)
    }
    arr.push(i)
  }

  const channels: ScrewChannel[] = []

  for (const group of groups.values()) {
    // Raggio del tubo = rim più piccolo del gruppo (sede/counterbore sono
    // più larghi; il tubo è il foro della vite)
    const tubeRadius = Math.min(...group.map(gi => rims[gi].radius))

    let initialAxis: THREE.Vector3
    let initialBottom: THREE.Vector3
    let initialTop: THREE.Vector3

    if (group.length >= 2) {
      // Asse iniziale = direzione tra i due rim più distanti del gruppo
      let bestI = group[0], bestJ = group[1], bestDist = 0
      for (let gi = 0; gi < group.length; gi++) {
        for (let gj = gi + 1; gj < group.length; gj++) {
          const d = rims[group[gi]].center.distanceTo(rims[group[gj]].center)
          if (d > bestDist) {
            bestDist = d
            bestI = group[gi]
            bestJ = group[gj]
          }
        }
      }
      initialAxis = new THREE.Vector3().subVectors(rims[bestJ].center, rims[bestI].center).normalize()
      initialBottom = rims[bestI].center
      initialTop = rims[bestJ].center
    } else {
      // Rim singolo: accettato solo se in range tubo (a volte il rim della
      // sede non fitta perché fuso con l'anatomia) — asse = normale del rim
      const rim = rims[group[0]]
      if (rim.radius > 1.6) continue
      initialAxis = rim.normal.clone()
      initialBottom = rim.center.clone().addScaledVector(rim.normal, -2)
      initialTop = rim.center.clone().addScaledVector(rim.normal, 2)
    }

    // 5. Raffinamento seguendo la banda del tubo
    const refined = refineCylinder(graph, initialAxis, initialBottom, initialTop, tubeRadius)
    if (!refined) continue
    if (refined.radius < opts.minRadius || refined.radius > opts.maxRadius) continue
    if (refined.height < opts.minChannelHeight) continue

    // 6. Validazione radiale
    const rayScore = validateChannelRadially(geometry, refined)
    if (rayScore < 0.5) continue

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

/** Regolazione manuale dell'asse di inserzione (gradi, rispetto all'asse medio) */
export interface AxisAdjustment {
  flipped: boolean
  tiltU: number
  tiltV: number
}

export const DEFAULT_AXIS_ADJUSTMENT: AxisAdjustment = { flipped: false, tiltU: 0, tiltV: 0 }

/**
 * Applica flip e due tilt ortogonali all'asse base. u/v sono una base
 * stabile del piano ⊥ asse, così gli slider hanno un significato coerente.
 */
export function applyAxisAdjustment(base: THREE.Vector3, adj: AxisAdjustment): THREE.Vector3 {
  const axis = base.clone().normalize()
  if (adj.flipped) axis.negate()

  const ref = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(axis, ref).normalize()
  const v = new THREE.Vector3().crossVectors(axis, u).normalize()

  if (adj.tiltU !== 0) {
    axis.applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(u, THREE.MathUtils.degToRad(adj.tiltU))
    )
  }
  if (adj.tiltV !== 0) {
    axis.applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(v, THREE.MathUtils.degToRad(adj.tiltV))
    )
  }
  return axis.normalize()
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
