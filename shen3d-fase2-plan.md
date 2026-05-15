# Shen3D — Fase 2: Linee di Taglio Geometriche tra Impianti

> **Per Claude Code:** Implementare task per task. Ogni task è autosufficiente.
> **Obiettivo:** Dopo che Fase 1 ha rilevato gli impianti (cilindri RANSAC), Fase 2 traccia automaticamente le linee di taglio tra gli impianti e genera i piani di taglio perpendicolari.

## Contesto

La Fase 1 produce `MeshAnalysisResult` con:
- `cylinderCandidates`: array di cilindri rilevati (ognuno con `center`, `axis`, `radius`, `height`)
- `curvatureData`: heat map curvatura
- `vertexCount`, `faceCount`: info mesh

La Fase 2 usa queste informazioni per proporre dove tagliare il ponte.

## Concetto Chiave: Taglio Ponte Dentale

Un ponte avvitato su impianti va tagliato in 2 parti:
1. **Sopra** — la struttura del ponte (corone)
2. **Sotto** — la base di connessione agli impianti (abutments)

Il piano di taglio è **perpendicolare all'asse dell'impianto** e passa in un punto tra la corona e l'abutment. Con 2+ impianti, il piano migliore è quello che:
- È perpendicolare alla direzione media degli assi degli impianti
- Passa per il punto di giunzione naturale (dove la curvatura cambia bruscamente)

---

## Task 1: Tipi dati per piani di taglio

**Obiettivo:** Definire i TypeScript types per piani di taglio e linee

**File:** `src/lib/cutting-plane.ts`

```typescript
import * as THREE from 'three'

/** Un singolo impianto con dati estesi per il taglio */
export interface ImplantForCutting {
  index: number
  center: THREE.Vector3
  axis: THREE.Vector3     // asse dell'impianto (normalizzato)
  radius: number
  topPoint: THREE.Vector3    // punto più alto dell'impianto
  bottomPoint: THREE.Vector3  // punto più basso dell'impianto
  junctionPoint: THREE.Vector3  // punto di giunzione corona-abutment (stimato)
}

/** Piano di taglio proposto dall'AI */
export interface CuttingPlane {
  id: string
  normal: THREE.Vector3       // normale del piano (perpendicolare al piano)
  point: THREE.Vector3        // punto sul piano
  confidence: number          // 0-1, quanto è sicuro l'algoritmo
  method: 'junction' | 'midpoint' | 'curvature'  // come è stato calcolati
  implantIndices: number[]    // impianti coinvolti
}

/** Linea di taglio visualizzata sulla superficie STL */
export interface CutLine {
  id: string
  planeId: string
  points: THREE.Vector3[]     // punti sulla superficie del mesh
  closed: boolean            // è una linea chiusa (circumferenziale)?
}

/** Risultato completo della fase di taglio */
export interface CuttingResult {
  implants: ImplantForCutting[]
  planes: CuttingPlane[]
  lines: CutLine[]
  averageAxis: THREE.Vector3   // asse medio degli impianti
}
```

**Step:** Crea il file con i tipi sopra. Commit: `feat: add cutting plane types`

---

## Task 2: Funzione di preprocessing impianti

**Obiettivo:** Convertire i cilindri RANSAC in dati pronti per il taglio

**File:** `src/lib/cutting-plane.ts` (aggiungi alla fine)

```typescript
import { MeshAnalysisResult } from './mesh-analysis'

/** Calcola il punto di giunzione corona-abutment per un cilindro */
function findJunctionPoint(
  center: THREE.Vector3,
  axis: THREE.Vector3,
  height: number,
  curvatureValues: Float32Array,
  positions: Float32Array
): THREE.Vector3 {
  // Il punto di giunzione è dove la curvatura cambia bruscamente
  // lungo l'asse dell'impianto. Cerchiamo il picco di curvatura
  // nella metà superiore del cilindro.
  
  const normalizedAxis = axis.clone().normalize()
  const topPoint = center.clone().add(normalizedAxis.clone().multiplyScalar(height / 2))
  const bottomPoint = center.clone().sub(normalizedAxis.clone().multiplyScalar(height / 2))
  
  // Semplificazione: la giunzione è circa al 60-70% dell'altezza dal basso
  // (nella parte superiore del cilindro dove inizia la corona)
  const junctionRatio = 0.65
  const junctionPoint = bottomPoint.clone().add(
    normalizedAxis.clone().multiplyScalar(height * junctionRatio)
  )
  
  return junctionPoint
}

/** Converte i cilindri RANSAC in ImplantForCutting */
export function prepareImplantsForCutting(
  analysisResult: MeshAnalysisResult
): ImplantForCutting[] {
  const normalizedAxis = new THREE.Vector3()
  
  return analysisResult.cylinderCandidates.map((cyl, index) => {
    normalizedAxis.copy(cyl.axis).normalize()
    const height = cyl.height || (cyl.radius * 4) // fallback se height manca
    
    const topPoint = cyl.center.clone().add(normalizedAxis.clone().multiplyScalar(height / 2))
    const bottomPoint = cyl.center.clone().sub(normalizedAxis.clone().multiplyScalar(height / 2))
    
    // Trova punto di giunzione (semplificato — in Fase 8 useremo ML)
    const junctionPoint = findJunctionPoint(
      cyl.center, normalizedAxis, height, new Float32Array(0), new Float32Array(0)
    )
    
    return {
      index,
      center: cyl.center.clone(),
      axis: normalizedAxis.clone(),
      radius: cyl.radius,
      topPoint,
      bottomPoint,
      junctionPoint,
    }
  })
}
```

**Step:** Aggiungi le funzioni al file. Commit: `feat: implant preprocessing for cutting`

---

## Task 3: Generazione piani di taglio

**Obiettivo:** Generare automaticamente i piani di taglio per ogni impianto

**File:** `src/lib/cutting-plane.ts` (aggiungi alla fine)

```typescript
/** Genera piani di taglio proposti per gli impianti */
export function generateCuttingPlanes(implants: ImplantForCutting[]): CuttingPlane[] {
  if (implants.length === 0) return []
  
  const planes: CuttingPlane[] = []
  
  // Piano 1: Per ogni impianto, piano perpendicolare al suo asse che passa per la giunzione
  for (const implant of implants) {
    planes.push({
      id: `plane-junction-${implant.index}`,
      normal: implant.axis.clone(),
      point: implant.junctionPoint.clone(),
      confidence: 0.7,
      method: 'junction',
      implantIndices: [implant.index],
    })
  }
  
  // Piano 2: Se ci sono 2+ impianti, piano unico perpendicolare all'asse medio
  if (implants.length >= 2) {
    const averageAxis = new THREE.Vector3()
    for (const imp of implants) {
      averageAxis.add(imp.axis)
    }
    averageAxis.normalize()
    
    // Punto medio tra tutte le giunzioni
    const midpoint = new THREE.Vector3()
    for (const imp of implants) {
      midpoint.add(imp.junctionPoint)
    }
    midpoint.divideScalar(implants.length)
    
    planes.push({
      id: 'plane-unified',
      normal: averageAxis.clone(),
      point: midpoint.clone(),
      confidence: 0.85,
      method: 'midpoint',
      implantIndices: implants.map(i => i.index),
    })
  }
  
  return planes
}

/** Calcola il risultato completo di taglio */
export function computeCuttingResult(
  analysisResult: MeshAnalysisResult
): CuttingResult {
  const implants = prepareImplantsForCutting(analysisResult)
  const planes = generateCuttingPlanes(implants)
  
  // Calcola asse medio
  const averageAxis = new THREE.Vector3()
  if (implants.length > 0) {
    for (const imp of implants) averageAxis.add(imp.axis)
    averageAxis.normalize()
  }
  
  // Le linee di taglio saranno calcolate dall'intersezione piano-mesh (Task 5)
  const lines: CutLine[] = []
  
  return { implants, planes, lines, averageAxis }
}
```

**Step:** Aggiungi le funzioni. Commit: `feat: cutting plane generation algorithm`

---

## Task 4: Visualizzazione piani di taglio nel viewer 3D

**Obiettivo:** Mostrare i piani di taglio come dischi semi-trasparenti e le linee di giunzione

**File:** `src/components/viewer/cutting-plane-visual.tsx`

Crea un componente R3F che:
1. Per ogni `CuttingPlane`, renderizza un disco semi-trasparente colorato:
   - `junction` → arancione (opacity 0.3)
   - `midpoint` → verde (opacity 0.4, più spesso = più fiducia)
2. Il disco è posizionato nel punto del piano, orientato con la normale
3. I bordi del disco sono visibili (wireframe ring)
4. L'utente può cliccare su un piano per selezionarlo

```tsx
'use client'

import { CuttingPlane, CuttingResult } from '@/lib/cutting-plane'
import { useMemo } from 'react'
import * as THREE from 'three'

interface CuttingPlaneVisualProps {
  cuttingResult: CuttingResult
  selectedPlaneId: string | null
  onPlaneSelect: (id: string | null) => void
}

function PlaneDisk({ plane, selected, onSelect }: {
  plane: CuttingPlane
  selected: boolean
  onSelect: () => void
}) {
  const color = plane.method === 'junction' ? '#f59e0b' : '#10b981'
  const size = 20 // dimensione disco
  
  const matrix = useMemo(() => {
    const m = new THREE.Matrix4()
    const position = plane.point
    const up = new THREE.Vector3(0, 1, 0)
    const normal = plane.normal.clone().normalize()
    
    // Calcola rotazione per allineare Y con la normale
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal)
    m.makeRotationFromQuaternion(quaternion)
    m.setPosition(position)
    return m
  }, [plane.point, plane.normal])
  
  return (
    <group matrix={matrix} onClick={(e) => { e.stopPropagation(); onSelect() }}>
      {/* Disco semi-trasparente */}
      <mesh>
        <circleGeometry args={[size, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.5 : 0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Bordo del disco */}
      <mesh>
        <ringGeometry args={[size - 0.3, size, 64]} />
        <meshBasicMaterial
          color={selected ? '#ffffff' : color}
          transparent
          opacity={selected ? 0.9 : 0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Linee centrali di riferimento */}
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(size * 2, size * 2)]} />
        <lineBasicMaterial color={color} transparent opacity={0.3} />
      </lineSegments>
    </group>
  )
}

export function CuttingPlaneVisual({ cuttingResult, selectedPlaneId, onPlaneSelect }: CuttingPlaneVisualProps) {
  return (
    <group>
      {cuttingResult.planes.map(plane => (
        <PlaneDisk
          key={plane.id}
          plane={plane}
          selected={plane.id === selectedPlaneId}
          onSelect={() => onPlaneSelect(plane.id === selectedPlaneId ? null : plane.id)}
        />
      ))}
    </group>
  )
}
```

**Step:** Crea il componente. Commit: `feat: cutting plane 3D visualization`

---

## Task 5: Intersezione piano-mesh per linee di taglio

**Obiettivo:** Calcolare dove il piano di taglio interseca la superficie STL → produce la linea di taglio visibile

**File:** `src/lib/mesh-intersection.ts`

```typescript
import * as THREE from 'three'
import { CuttingPlane, CutLine } from './cutting-plane'

/**
 * Calcola l'intersezione tra un piano di taglio e la superficie mesh.
 * Restituisce una lista di punti che formano la linea di taglio.
 * 
 * Algoritmo:
 * 1. Per ogni triangolo del mesh, verifica se il piano lo attraversa
 * 2. Se sì, calcola i 2 punti di intersezione sui lati del triangolo
 * 3. Concatena i segmenti in una linea ordinata
 */
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
    
    // Conta quanti vertici sono sopra/sotto il piano
    const above = (distA > 0 ? 1 : 0) + (distB > 0 ? 1 : 0) + (distC > 0 ? 1 : 0)
    
    // Il piano attraversa il triangolo se non tutti sono dallo stesso lato
    if (above === 0 || above === 3) continue
    
    // Trova i 2 punti di intersezione
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
  
  // Ordina i segmenti in una linea connessa (greedy nearest-neighbor)
  const points = orderSegments(segments)
  
  return {
    id: `line-${plane.id}`,
    planeId: plane.id,
    points,
    closed: false, // determinare se chiusa è complesso, semplifichiamo
  }
}

/** Ordina segmenti sconnessi in una linea connessa tramite nearest-neighbor */
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
    
    if (bestIdx === -1 || bestDist > 2.0) break // soglia: se troppo lontano, fermati
    
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

/** Calcola tutte le linee di taglio per tutti i piani */
export function computeAllCutLines(
  planes: CuttingPlane[],
  geometry: THREE.BufferGeometry
): CutLine[] {
  return planes.map(plane => intersectPlaneMesh(plane, geometry))
}
```

**Step:** Crea il file. Commit: `feat: plane-mesh intersection for cut lines`

---

## Task 6: Visualizzazione linee di taglio nel viewer

**Obiettivo:** Mostrare le linee di taglio come linee colorate sulla superficie STL

**File:** `src/components/viewer/cut-line-visual.tsx`

```tsx
'use client'

import { CutLine } from '@/lib/cutting-plane'
import { useMemo } from 'react'
import * as THREE from 'three'

interface CutLineVisualProps {
  lines: CutLine[]
}

function CutLineRender({ line }: { line: CutLine }) {
  const geometry = useMemo(() => {
    if (line.points.length < 2) return null
    const positions = new Float32Array(line.points.length * 3)
    line.points.forEach((p, i) => {
      positions[i * 3] = p.x
      positions[i * 3 + 1] = p.y
      positions[i * 3 + 2] = p.z
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [line.points])
  
  if (!geometry) return null
  
  const method = line.planeId.includes('junction') ? 'junction' : 
                 line.planeId.includes('unified') ? 'midpoint' : 'curvature'
  const color = method === 'junction' ? '#f59e0b' : method === 'midpoint' ? '#10b981' : '#6366f1'
  
  return (
    <line geometry={geometry}>
      <lineBasicMaterial
        color={color}
        linewidth={2}
        transparent
        opacity={0.9}
      />
    </line>
  )
}

export function CutLineVisual({ lines }: CutLineVisualProps) {
  return (
    <group>
      {lines.map(line => (
        <CutLineRender key={line.id} line={line} />
      ))}
    </group>
  )
}
```

**Step:** Crea il componente. Commit: `feat: cut line 3D visualization`

---

## Task 7: Integrazione nello StlViewer esistente

**Obiettivo:** Aggiungere i piani di taglio e le linee al viewer esistente

**Modifiche al file:** `src/components/viewer/stl-viewer.tsx`

Aggiungi:
1. Dopo che l'analisi è completa (`onAnalysisComplete`), calcola automaticamente `CuttingResult`
2. Renderizza `CuttingPlaneVisual` e `CutLineVisual` dentro il Canvas R3F
3. Passa il `geometry` del mesh a `computeAllCutLines`
4. Aggiungi stato per il piano selezionato

**Modifiche al file:** `src/components/viewer/viewer-section.tsx`

Aggiungi:
1. Stato `cuttingResult` nel componente
2. Quando `analysisResult` cambia, calcola automaticamente `computeCuttingResult`
3. Mostra nel toolbar i piani di taglio con toggle on/off
4. Pannello info che mostra: metodo, confidence, impianti coinvolti

**Step:** Modifica i file. Commit: `feat: integrate cutting planes into viewer`

---

## Task 8: Pannello laterale info taglio

**Obiettivo:** Mostrare nella sidebar i dettagli dei piani di taglio

**Modifiche al file:** `src/components/layout/sidebar.tsx`

Aggiungi sezione "Piani di Taglio":
- Lista dei piani con:
  - Icona colore (arancione per junction, verde per midpoint)
  - Metodo usato
  - Confidence bar (0-100%)
  - Impianti coinvolti
- Se un piano è selezionato:
  - Posizione (x, y, z)
  - Normale (nx, ny, nz)
  - Numero di punti nella linea di taglio

**Step:** Modifica il file. Commit: `feat: cutting plane info in sidebar`

---

## Task 9: Test visivo completo

**Obiettivo:** Verificare che tutto funziona end-to-end

1. Carica un file STL
2. Verifica che gli impianti vengono rilevati (Fase 1)
3. Verifica che i piani di taglio appaiono automaticamente dopo l'analisi
4. Verifica che le linee di taglio sono visibili sulla superficie
5. Verifica che si può cliccare su un piano per selezionarlo
6. Verifica che la sidebar mostra le informazioni

**Step:** Test manuale. Se tutto ok: `feat: phase 2 complete — cutting planes and lines`

---

## Note per l'implementazione

- **Ordine dei task:** 1→2→3→4→5→6→7→8→9
- **Ogni task** produce un commit separato
- **Non modificare** i componenti esistenti della Fase 1 — solo aggiungere/estendere
- **Usa sempre** `'use client'` per i componenti R3F
- **three-mesh-bvh** NON serve per l'intersezione piano-mesh — usiamo geometria analitica
- **Le linee** potrebbero non essere perfettamente chiuse o ordinate — accettabile per Fase 2
- **La Fase 4** aggiungerà il drag interattivo per modificare i piani
- **R3F `<line>`** — in React Three Fiber, usa `<line>` (lowercase) per LineSegments, geometry con BufferAttribute
