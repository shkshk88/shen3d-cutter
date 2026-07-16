import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { jacobiEigen3, fitCircle2D, clusterPoints, detectScrewChannels } from '../screw-channels'
import { buildMeshGraph } from '../mesh-graph'
import { computeCurvatureFromGraph } from '../curvature'

describe('jacobiEigen3', () => {
  it('trova autovalori di una matrice diagonale', () => {
    const { values } = jacobiEigen3([3, 0, 0, 0, 1, 0, 0, 0, 2])
    expect(values[0]).toBeCloseTo(1, 6)
    expect(values[1]).toBeCloseTo(2, 6)
    expect(values[2]).toBeCloseTo(3, 6)
  })

  it('trova la normale di un piano da covarianza di punti planari', () => {
    // Punti sul piano z=0 → autovettore minimo = ±Z
    const pts: number[][] = []
    for (let i = 0; i < 100; i++) {
      pts.push([Math.cos(i), Math.sin(i * 1.7), 0])
    }
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
    for (const [x, y, z] of pts) {
      xx += x * x; xy += x * y; xz += x * z
      yy += y * y; yz += y * z; zz += z * z
    }
    const { vectors } = jacobiEigen3([xx, xy, xz, xy, yy, yz, xz, yz, zz])
    expect(Math.abs(vectors[0].z)).toBeCloseTo(1, 5)
  })
})

describe('fitCircle2D', () => {
  it('fitta un cerchio perfetto', () => {
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2
      xs.push(3 + 1.5 * Math.cos(a))
      ys.push(-2 + 1.5 * Math.sin(a))
    }
    const fit = fitCircle2D(xs, ys)!
    expect(fit.cx).toBeCloseTo(3, 4)
    expect(fit.cy).toBeCloseTo(-2, 4)
    expect(fit.r).toBeCloseTo(1.5, 4)
    expect(fit.residual).toBeLessThan(1e-6)
  })

  it('fitta un cerchio con rumore', () => {
    const xs: number[] = []
    const ys: number[] = []
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648 - 0.5
    }
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2
      xs.push(2 * Math.cos(a) + rand() * 0.05)
      ys.push(2 * Math.sin(a) + rand() * 0.05)
    }
    const fit = fitCircle2D(xs, ys)!
    expect(fit.r).toBeCloseTo(2, 1)
    expect(fit.residual).toBeLessThan(0.05)
  })
})

describe('clusterPoints', () => {
  it('separa due gruppi distanti', () => {
    const points = new Float32Array([
      // gruppo A attorno all'origine
      0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0.1, 0.1, 0, 0.05, 0.05, 0.05,
      0, 0, 0.1, 0.1, 0, 0.1, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.05, 0, 0.05,
      // gruppo B a (10,10,10)
      10, 10, 10, 10.1, 10, 10, 10, 10.1, 10, 10.1, 10.1, 10, 10.05, 10.05, 10,
      10, 10, 10.1, 10.1, 10, 10.1, 10, 10.1, 10.1, 10.1, 10.1, 10.1, 10.05, 10, 10.05,
    ])
    const indices = Array.from({ length: 20 }, (_, i) => i)
    const clusters = clusterPoints(points, indices, 0.5, 4)
    expect(clusters.length).toBe(2)
    expect(clusters[0].length).toBe(10)
    expect(clusters[1].length).toBe(10)
  })
})

/**
 * Mesh sintetica: blocco con un tubo cilindrico verticale passante.
 * Ground truth: asse Z, raggio r, altezza h.
 */
function makeTubeGeometry(radius: number, height: number): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = []

  // Parete interna del tubo (cilindro aperto)
  const tube = new THREE.CylinderGeometry(radius, radius, height, 48, 24, true)
  geometries.push(tube)

  // Piastre superiore/inferiore con foro (anelli)
  const ringTop = new THREE.RingGeometry(radius, radius * 4, 48, 4)
  ringTop.rotateX(-Math.PI / 2)
  ringTop.translate(0, height / 2, 0)
  geometries.push(ringTop)

  const ringBottom = new THREE.RingGeometry(radius, radius * 4, 48, 4)
  ringBottom.rotateX(Math.PI / 2)
  ringBottom.translate(0, -height / 2, 0)
  geometries.push(ringBottom)

  // Merge manuale in una geometria non indicizzata (come farebbe STLLoader)
  const positions: number[] = []
  for (const g of geometries) {
    const nonIndexed = g.toNonIndexed()
    const pos = nonIndexed.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    }
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.computeVertexNormals()
  return merged
}

describe('detectScrewChannels su mesh sintetica', () => {
  it('rileva un tubo verticale con raggio e asse corretti', () => {
    const radius = 1.5
    const height = 10
    const geometry = makeTubeGeometry(radius, height)
    const graph = buildMeshGraph(geometry)
    const curvature = computeCurvatureFromGraph(graph)

    const channels = detectScrewChannels(geometry, graph, curvature, {
      // niente BVH nel test → la validazione radiale usa il fallback 0.5
      curvaturePercentile: 0.7,
    })

    expect(channels.length).toBe(1)
    const ch = channels[0]
    expect(ch.radius).toBeCloseTo(radius, 0)
    expect(Math.abs(ch.radius - radius)).toBeLessThan(0.3)
    // Asse ±Y (la CylinderGeometry di three è allineata a Y)
    expect(Math.abs(ch.axis.y)).toBeGreaterThan(0.98)
    expect(ch.height).toBeGreaterThan(height * 0.8)
    expect(ch.height).toBeLessThan(height * 1.2)
    // Centro sull'asse
    expect(Math.hypot(ch.center.x, ch.center.z)).toBeLessThan(0.3)
  })
})
