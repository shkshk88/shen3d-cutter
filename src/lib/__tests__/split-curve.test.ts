import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  densifySplitCurve,
  resampleUniform,
  validateSplitCurve,
  proposeSplitCurve,
  serializeCurvePoints,
  deserializeCurvePoints,
  SplitCurve,
} from '../split-curve'
import { buildMeshGraph } from '../mesh-graph'

function makeCircleCurve(radius: number, n: number, closed = true): SplitCurve {
  const controlPoints: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    controlPoints.push(new THREE.Vector3(radius * Math.cos(a), 0, radius * Math.sin(a)))
  }
  return { controlPoints, closed }
}

describe('densifySplitCurve', () => {
  it('densifica una curva chiusa senza duplicare il punto iniziale', () => {
    const curve = makeCircleCurve(10, 8)
    const dense = densifySplitCurve(curve, null)
    expect(dense.length).toBeGreaterThan(8)
    const first = dense[0]
    const last = dense[dense.length - 1]
    expect(first.distanceTo(last)).toBeGreaterThan(0.01)
  })
})

describe('resampleUniform', () => {
  it('produce punti a passo circa uniforme', () => {
    const curve = makeCircleCurve(10, 64)
    const resampled = resampleUniform(curve.controlPoints, 1.0, true)
    const spacings: number[] = []
    for (let i = 1; i < resampled.length; i++) {
      spacings.push(resampled[i].distanceTo(resampled[i - 1]))
    }
    const mean = spacings.reduce((a, b) => a + b, 0) / spacings.length
    for (const s of spacings) {
      expect(Math.abs(s - mean)).toBeLessThan(mean * 0.5)
    }
  })
})

describe('validateSplitCurve', () => {
  it('accetta un cerchio chiuso senza canali', () => {
    const curve = makeCircleCurve(10, 12)
    const dense = densifySplitCurve(curve, null)
    const result = validateSplitCurve(curve, dense, [], new THREE.Vector3(0, 1, 0))
    expect(result.valid).toBe(true)
  })

  it('rifiuta una curva aperta o con pochi punti', () => {
    const open = makeCircleCurve(10, 12, false)
    const dense = densifySplitCurve(open, null)
    const result = validateSplitCurve(open, dense, [], null)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('chiusa'))).toBe(true)
  })

  it('rileva auto-intersezioni (figura a 8)', () => {
    // Figura a 8 nel piano XZ
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.sin(t) * 10, 0, Math.sin(2 * t) * 5))
    }
    const curve: SplitCurve = { controlPoints: pts, closed: true }
    const result = validateSplitCurve(curve, pts, [], new THREE.Vector3(0, 1, 0))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('auto-interseca'))).toBe(true)
  })

  it('rileva curva troppo vicina a un canale', () => {
    const curve = makeCircleCurve(3, 12)
    const dense = densifySplitCurve(curve, null)
    const channel = {
      id: 'c0',
      center: new THREE.Vector3(3, 0, 0),
      axis: new THREE.Vector3(0, 1, 0),
      radius: 1.5,
      height: 10,
      top: new THREE.Vector3(3, 5, 0),
      bottom: new THREE.Vector3(3, -5, 0),
      confidence: 1,
      source: 'auto' as const,
    }
    const result = validateSplitCurve(curve, dense, [channel], new THREE.Vector3(0, 1, 0))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('canale 1'))).toBe(true)
  })
})

describe('serializzazione', () => {
  it('round-trip senza perdita significativa', () => {
    const curve = makeCircleCurve(7.531, 10)
    const serialized = serializeCurvePoints(curve.controlPoints)
    const restored = deserializeCurvePoints(serialized)
    for (let i = 0; i < curve.controlPoints.length; i++) {
      expect(restored[i].distanceTo(curve.controlPoints[i])).toBeLessThan(0.001)
    }
  })
})

describe('proposeSplitCurve', () => {
  it('propone una curva chiusa dalla silhouette di un solido', () => {
    // Cilindro solido (chiuso): silhouette a qualsiasi quota = cerchio
    const solid = new THREE.CylinderGeometry(20, 20, 30, 48, 8, false)
    const nonIndexed = solid.toNonIndexed()
    nonIndexed.computeVertexNormals()
    const graph = buildMeshGraph(nonIndexed)

    const proposed = proposeSplitCurve({
      graph,
      channels: [],
      insertionAxis: new THREE.Vector3(0, 1, 0),
      geometry: null,
    })

    expect(proposed).not.toBeNull()
    expect(proposed!.closed).toBe(true)
    expect(proposed!.controlPoints.length).toBeGreaterThanOrEqual(8)
    // Tutti i punti a raggio ~20 dal centro
    for (const p of proposed!.controlPoints) {
      const r = Math.hypot(p.x, p.z)
      expect(Math.abs(r - 20)).toBeLessThan(2.5)
    }
  })
})
