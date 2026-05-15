import * as THREE from 'three'
import { CuttingPlane, CutLine } from './cutting-plane'

export function intersectPlaneMesh(
  plane: CuttingPlane,
  geometry: THREE.BufferGeometry
): CutLine {
  const positionAttr = geometry.getAttribute('position')
  const indexAttr = geometry.getIndex()

  if (!positionAttr || !indexAttr) {
    return { id: `line-${plane.id}`, planeId: plane.id, points: [], closed: false }
  }

  const planeNormal = plane.normal.clone().normalize()
  const planeConstant = -planeNormal.dot(plane.point)
  const plane3 = new THREE.Plane(planeNormal, planeConstant)

  const segments: [THREE.Vector3, THREE.Vector3][] = []
  const vA = new THREE.Vector3()
  const vB = new THREE.Vector3()
  const vC = new THREE.Vector3()

  for (let i = 0; i < indexAttr.count; i += 3) {
    const a = indexAttr.getX(i)
    const b = indexAttr.getX(i + 1)
    const c = indexAttr.getX(i + 2)

    vA.fromBufferAttribute(positionAttr, a)
    vB.fromBufferAttribute(positionAttr, b)
    vC.fromBufferAttribute(positionAttr, c)

    const distA = plane3.distanceToPoint(vA)
    const distB = plane3.distanceToPoint(vB)
    const distC = plane3.distanceToPoint(vC)

    const above = (distA > 0 ? 1 : 0) + (distB > 0 ? 1 : 0) + (distC > 0 ? 1 : 0)

    if (above === 0 || above === 3) continue

    const intersections: THREE.Vector3[] = []
    const edges: [THREE.Vector3, number, THREE.Vector3, number][] = [
      [vA, distA, vB, distB],
      [vB, distB, vC, distC],
      [vC, distC, vA, distA],
    ]

    for (const [p1, d1, p2, d2] of edges) {
      if ((d1 > 0 && d2 <= 0) || (d1 <= 0 && d2 > 0)) {
        const t = d1 / (d1 - d2)
        const intersection = p1.clone().lerp(p2, t)
        intersections.push(intersection)
      }
    }

    if (intersections.length >= 2) {
      segments.push([intersections[0], intersections[1]])
    }
  }

  const points = orderSegments(segments)

  return {
    id: `line-${plane.id}`,
    planeId: plane.id,
    points,
    closed: false,
  }
}

function orderSegments(segments: [THREE.Vector3, THREE.Vector3][]): THREE.Vector3[] {
  if (segments.length === 0) return []

  const used = new Set<number>()
  const result: THREE.Vector3[] = [segments[0][0].clone(), segments[0][1].clone()]
  used.add(0)

  const maxIter = segments.length
  for (let iter = 0; iter < maxIter; iter++) {
    const lastPoint = result[result.length - 1]
    let bestDist = Infinity
    let bestIdx = -1
    let bestFlip = false

    for (let i = 0; i < segments.length; i++) {
      if (used.has(i)) continue
      const d1 = lastPoint.distanceTo(segments[i][0])
      const d2 = lastPoint.distanceTo(segments[i][1])
      if (d1 < bestDist) { bestDist = d1; bestIdx = i; bestFlip = false }
      if (d2 < bestDist) { bestDist = d2; bestIdx = i; bestFlip = true }
    }

    if (bestIdx === -1 || bestDist > 2.0) break

    used.add(bestIdx)
    if (bestFlip) {
      result.push(segments[bestIdx][1].clone())
      result.push(segments[bestIdx][0].clone())
    } else {
      result.push(segments[bestIdx][0].clone())
      result.push(segments[bestIdx][1].clone())
    }
  }

  return result
}

export function computeAllCutLines(
  planes: CuttingPlane[],
  geometry: THREE.BufferGeometry
): CutLine[] {
  return planes.map(plane => intersectPlaneMesh(plane, geometry))
}
