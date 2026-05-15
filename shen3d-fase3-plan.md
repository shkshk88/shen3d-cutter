# Shen3D — Fase 3: Piano Parametrico + Editing Interattivo

> **Per Claude Code:** Implementare task per task. Ogni task è autosufficiente.

## Obiettivo

L'utente può modificare il piano di taglio interattivamente: spostarlo lungo l'asse, inclinarlo, e trascinare punti di controllo sulla superficie STL. Niente OCCT.js per ora — tutta l'interattività è nel browser con R3F.

## Contesto

La Fase 2 produce `CuttingResult` con piani di taglio e linee sulla superficie. Ora l'utente deve poter:
1. Spostare il piano su/giù lungo l'asse degli impianti
2. Inclinare il piano (angolo, tilt)
3. Vedere la linea di taglio aggiornarsi in tempo reale
4. Cliccare "Conferma taglio" per esportare

---

## Task 1: Parametri del piano di taglio

**Obiettivo:** Aggiungere parametri modificabili al CuttingPlane

**File:** `src/lib/cutting-plane.ts` (modifica)

Aggiungi al tipo `CuttingPlane`:
```typescript
export interface CuttingPlane {
  // ... esistenti ...
  offset: number          // spostamento lungo asse (mm), default 0
  tiltAngle: number       // inclinazione (gradi), default 0
  tiltAxis: THREE.Vector3 // asse di inclinazione, default (1,0,0)
}
```

Aggiungi funzione:
```typescript
/** Applica parametri offset e tilt a un piano di taglio */
export function applyPlaneParams(plane: CuttingPlane): {
  effectiveNormal: THREE.Vector3
  effectivePoint: THREE.Vector3
} {
  // Sposta il punto lungo la normale (offset)
  const effectivePoint = plane.point.clone().add(
    plane.normal.clone().multiplyScalar(plane.offset)
  )
  
  // Applica tilt (rotazione attorno a tiltAxis)
  const effectiveNormal = plane.normal.clone()
  if (plane.tiltAngle !== 0) {
    const quat = new THREE.Quaternion().setFromAxisAngle(
      plane.tiltAxis.clone().normalize(),
      THREE.MathUtils.degToRad(plane.tiltAngle)
    )
    effectiveNormal.applyQuaternion(quat).normalize()
  }
  
  return { effectiveNormal, effectivePoint }
}
```

Aggiungi alla generazione: default offset=0, tiltAngle=0, tiltAxis calcolato come perpendicolare alla normale nel piano XZ.

Commit: `feat: add offset and tilt params to cutting planes`

---

## Task 2: Slider e controlli parametrici nel toolbar

**Obiettivo:** Aggiungere slider per offset e tilt nel viewer

**File:** `src/components/viewer/viewer-section.tsx` (modifica)

Dopo che un piano di taglio è selezionato, mostra nel toolbar:
- **Offset slider**: -10mm a +10mm, step 0.5mm — sposta il piano su/giù
- **Tilt slider**: -30° a +30°, step 1° — inclina il piano
- **Reset button**: riporta offset e tilt a 0
- I valori si riflettono immediatamente nel 3D (stato React)

Aggiungi stato:
```typescript
const [planeParams, setPlaneParams] = useState<Record<string, { offset: number; tiltAngle: number }>>({})
```

Quando l'utente muove uno slider, aggiorna `planeParams[planeId]` e ricalcola il piano.

Commit: `feat: parametric sliders for cutting plane offset and tilt`

---

## Task 3: Aggiornamento real-time del piano nel viewer

**Obiettivo:** Quando l'utente muove lo slider, il disco 3D e la linea di taglio si aggiornano

**File:** `src/components/viewer/cutting-plane-visual.tsx` (modifica)

Il componente `PlaneDisk` deve usare i parametri offset/tilt:
1. Ricevi `offset` e `tiltAngle` come props
2. Usa `applyPlaneParams` per calcolare la posizione e normale effettiva
3. Il disco si riposiziona e ruota in tempo reale

**File:** `src/components/viewer/stl-viewer.tsx` (modifica)

Quando i parametri cambiano:
1. Ricalcola le linee di taglio con `intersectPlaneMesh` usando il piano aggiornato
2. Aggiorna la visualizzazione

Usa `useMemo` con dipendenza dai parametri per evitare ricalcoli inutili.

Commit: `feat: real-time cutting plane update on param change`

---

## Task 4: Drag del piano direttamente nel 3D

**Obiettivo:** L'utente può trascinare il piano di taglio direttamente nel viewer 3D

**File:** `src/components/viewer/cutting-plane-visual.tsx` (modifica)

Aggiungi drag interattivo al disco:
1. Usa `@react-three/drei` → `useDrag` o custom drag con `onPointerDown/Move/Up`
2. Il drag è vincolato lungo l'asse normale del piano (solo su/giù)
3. Mentre trascini, aggiorna l'offset → il disco e la linea si aggiornano
4. Mostra tooltip con valore offset corrente (es: "Offset: +2.5mm")

Pattern per drag vincolato:
```tsx
const [dragging, setDragging] = useState(false)
const dragStart = useRef<{ y: number; offset: number } | null>(null)

const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
  e.stopPropagation()
  setDragging(true)
  dragStart.current = { y: e.point.y, offset: offset }
  // Cattura pointer
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}

const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
  if (!dragging || !dragStart.current) return
  const delta = e.point.y - dragStart.current.y
  const newOffset = Math.max(-10, Math.min(10, dragStart.current.offset + delta))
  onOffsetChange(newOffset)
}

const onPointerUp = () => {
  setDragging(false)
  dragStart.current = null
}
```

Commit: `feat: drag cutting plane in 3D viewer`

---

## Task 5: Drag handle visibili (sfere di controllo)

**Obiettivo:** Mostrare sfere visibili sui bordi del piano di taglio per indicare che sono trascinabili

**File:** `src/components/viewer/cutting-plane-visual.tsx` (modifica)

Aggiungi al disco:
1. **Sfera centrale** — drag verticale (offset su/giù)
2. **Freccia sulla normale** — indicatore direzione asse
3. **Arco di tilt** — piccolo arco sulla sfera per inclinare (o usa slider nel toolbar)

Le sfere usano:
- Colore bianco di default, giallo quando hovered, verde quando dragging
- `onPointerOver` / `onPointerOut` per hover effect
- Cursor CSS `grab` / `grabbing`

Commit: `feat: drag handles on cutting plane`

---

## Task 6: Preview della separazione

**Obiettivo:** Mostrare visivamente come il ponte verrebbe diviso in 2 parti

**File:** `src/components/viewer/stl-viewer.tsx` (modifica)

Quando un piano di taglio è attivo:
1. Colora i triangoli sopra il piano in un colore (es: blu trasparente)
2. Colora i triangoli sotto in un altro (es: rosso trasparente)
3. Non fare il taglio reale (booleana) — solo colorazione preview
4. Opzione toggle: "Mostra separazione" on/off

Algoritmo semplice:
```typescript
// Per ogni vertice, controlla se è sopra o sotto il piano
const plane = new THREE.Plane(effectiveNormal, -effectiveNormal.dot(effectivePoint))
const colors = new Float32Array(vertexCount * 3)
for (let i = 0; i < vertexCount; i++) {
  const v = new THREE.Vector3(positions[i*3], positions[i*3+1], positions[i*3+2])
  const dist = plane.distanceToPoint(v)
  if (dist > 0) {
    colors[i*3] = 0.3; colors[i*3+1] = 0.5; colors[i*3+2] = 1.0  // blu
  } else {
    colors[i*3] = 1.0; colors[i*3+1] = 0.3; colors[i*3+2] = 0.3  // rosso
  }
}
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
```

Usa `vertexColors: true` nel materiale mesh.

Commit: `feat: preview mesh separation with vertex coloring`

---

## Task 7: Esportazione annotazioni taglio

**Obiettivo:** Salvare i parametri del taglio come JSON scaricabile

**File:** `src/lib/export-cutting.ts`

```typescript
export interface CuttingExport {
  fileName: string
  timestamp: string
  implants: Array<{
    index: number
    center: [number, number, number]
    axis: [number, number, number]
    radius: number
  }>
  planes: Array<{
    id: string
    method: string
    normal: [number, number, number]
    point: [number, number, number]
    offset: number
    tiltAngle: number
    confidence: number
  }>
  selectedPlaneId: string | null
}
```

Funzione `exportCuttingParams(result, selectedPlaneId, fileName)` → scarica JSON.

Aggiungi pulsante "Export Parametri" nella sidebar (vicino a "Export Annotazioni").

Commit: `feat: export cutting parameters as JSON`

---

## Task 8: Build + deploy verification

**Obiettivo:** Verificare che tutto funziona end-to-end

1. `npm run build` passa
2. Push su GitHub
3. Verifica che gli slider funzionano
4. Verifica che il drag 3D funziona
5. Verifica la preview separazione
6. Verifica export JSON

Commit finale: `feat: phase 3 complete — parametric editing and interactive drag`

---

## Note

- **Niente OCCT.js** in questa fase — tutta l'interattività è nel browser con R3F
- **Il drag** è la feature chiave — l'utente deve poter spostare il piano col dito/mouse
- **La separazione** è solo visiva (colorazione) — il taglio reale è Fase 5
- **Ordine task:** 1→2→3→4→5→6→7→8
- **Ogni task** produce un commit separato
- **Usa sempre** `'use client'` per componenti R3F
