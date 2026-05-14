# Shen3D — Fase 1: STL Viewer + Rilevamento Impianti

> **Per Hermes/Claude Code:** Implementare task per task. Ogni task è autosufficiente.

**Obiettivo:** Creare una web app Next.js dove l'utente carica un file STL di un ponte dentale, lo visualizza in 3D con rotazione/zoom/pan, e il sistema rileva automaticamente i cilindri (impianti dentali) evidenziandoli.

**Architettura:** Next.js 14 App Router + React Three Fiber + Drei per il viewer, three-mesh-bvh per l'analisi mesh veloce, algoritmo custom di rilevamento cilindri tramite analisi di curvatura.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Three.js, @react-three/fiber, @react-three/drei, three-mesh-bvh

---

## Task 1: Setup progetto Next.js

**Obiettivo:** Creare il progetto base con tutte le dipendenze

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`

**Step 1: Crea il progetto**
```bash
npx create-next-app@latest shen3d-cutter --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd shen3d-cutter
```

**Step 2: Installa dipendenze 3D**
```bash
npm install three @react-three/fiber @react-three/drei three-mesh-bvh
npm install -D @types/three
```

**Step 3: Installa shadcn/ui**
```bash
npx shadcn@latest init
npx shadcn@latest add button card slider dropdown-menu separator
```

**Step 4: Verifica**
```bash
npm run dev
# Apri http://localhost:3000 — deve mostrare la pagina default Next.js
```

**Step 5: Commit**
```bash
git add .
git commit -m "feat: setup Next.js + R3F + Drei + shadcn/ui"
```

---

## Task 2: Layout base dell'app

**Obiettivo:** Creare il layout con sidebar e area viewer

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/components/layout/sidebar.tsx`
- Create: `src/components/layout/header.tsx`

**Step 1: Modifica layout.tsx**
```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/google/fonts'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Shen3D — Cutter Parametrico AI',
  description: 'Tool per scomporre ponti dentali STL con AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

**Step 2: Crea pagina principale**
```tsx
// src/app/page.tsx
import { ViewerSection } from '@/components/viewer/viewer-section'
import { Sidebar } from '@/components/layout/sidebar'

export default function Home() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <ViewerSection />
      </main>
    </div>
  )
}
```

**Step 3: Crea Sidebar**
```tsx
// src/components/layout/sidebar.tsx
'use client'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export function Sidebar() {
  return (
    <aside className="w-64 border-r bg-card flex flex-col">
      <div className="p-4">
        <h1 className="text-xl font-bold text-primary">Shen3D</h1>
        <p className="text-xs text-muted-foreground">Cutter Parametrico AI</p>
      </div>
      <Separator />
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">IMPIANTI RILEVATI</p>
        <p className="text-sm text-muted-foreground" id="implant-count">Nessun modello caricato</p>
      </div>
      <Separator />
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">PROPRIETÀ</p>
        <div id="model-info" className="text-sm text-muted-foreground">
          <p>Carica un STL per iniziare</p>
        </div>
      </div>
    </aside>
  )
}
```

**Step 4: Verifica**
```bash
npm run dev
# Deve mostrare layout con sidebar scura e area viewer vuota
```

**Step 5: Commit**
```bash
git add .
git commit -m "feat: layout base con sidebar"
```

---

## Task 3: Componente STL Viewer base

**Obiettivo:** Visualizzare un file STL nel browser con rotazione/zoom/pan

**Files:**
- Create: `src/components/viewer/viewer-section.tsx`
- Create: `src/components/viewer/stl-viewer.tsx`
- Create: `src/components/viewer/stl-model.tsx`
- Create: `src/components/viewer/loading-spinner.tsx`

**Step 1: Crea il wrapper viewer-section**
```tsx
// src/components/viewer/viewer-section.tsx
'use client'

import { useState, useCallback } from 'react'
import { StlViewer } from './stl-viewer'
import { Button } from '@/components/ui/button'

export function ViewerSection() {
  const [stlUrl, setStlUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setStlUrl(url)
    setFileName(file.name)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setStlUrl(url)
    setFileName(file.name)
  }, [])

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-12 border-b flex items-center px-4 gap-4 bg-card">
        <span className="text-sm font-medium">{fileName || 'Nessun file caricato'}</span>
        <label>
          <Button variant="outline" size="sm" asChild>
            <span>Carica STL</span>
          </Button>
          <input type="file" accept=".stl" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      {/* Viewer or Drop Zone */}
      <div
        className="flex-1 relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {stlUrl ? (
          <StlViewer url={stlUrl} />
        ) : (
          <div className="h-full flex items-center justify-center border-2 border-dashed rounded-lg m-4">
            <div className="text-center">
              <p className="text-lg text-muted-foreground">Trascina qui un file STL</p>
              <p className="text-sm text-muted-foreground mt-2">oppure clicca "Carica STL"</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Crea il Canvas R3F**
```tsx
// src/components/viewer/stl-viewer.tsx
'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Environment } from '@react-three/drei'
import { Suspense } from 'react'
import { StlModel } from './stl-model'
import { LoadingSpinner } from './loading-spinner'

interface StlViewerProps {
  url: string
}

export function StlViewer({ url }: StlViewerProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 100], fov: 50 }}
      gl={{ preserveDrawingBuffer: true }}
      className="bg-background"
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[50, 50, 25]} intensity={1} castShadow />
      <directionalLight position={[-50, -50, -25]} intensity={0.3} />

      <Suspense fallback={<LoadingSpinner />}>
        <StlModel url={url} />
      </Suspense>

      <ContactShadows position={[0, -30, 0]} opacity={0.4} scale={100} blur={2} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      <gridHelper args={[200, 20, '#333', '#222']} position={[0, -30, 0]} />
    </Canvas>
  )
}
```

**Step 3: Crea il caricatore STL**
```tsx
// src/components/viewer/stl-model.tsx
'use client'

import { useLoader } from '@react-three/fiber'
import { STLLoader } from 'three-stdlib'
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'

interface StlModelProps {
  url: string
  onGeometryReady?: (geometry: THREE.BufferGeometry) => void
}

export function StlModel({ url, onGeometryReady }: StlModelProps) {
  const geometry = useLoader(STLLoader, url)
  const meshRef = useRef<THREE.Mesh>(null)

  // Centra il modello e lo scala a dimensione ragionevole
  useEffect(() => {
    if (!geometry) return
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    const center = new THREE.Vector3()
    box.getCenter(center)
    geometry.translate(-center.x, -center.y, -center.z)

    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      const scale = 80 / maxDim
      geometry.scale(scale, scale, scale)
    }

    geometry.computeVertexNormals()
    onGeometryReady?.(geometry)
  }, [geometry])

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color="#a0c4ff"
        metalness={0.2}
        roughness={0.6}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
```

**Step 4: Crea lo spinner di caricamento**
```tsx
// src/components/viewer/loading-spinner.tsx
'use client'

import { useProgress } from '@react-three/drei'
import { Html } from '@react-three/drei'

export function LoadingSpinner() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">{Math.round(progress)}%</p>
      </div>
    </Html>
  )
}
```

**Step 5: Verifica**
```bash
npm run dev
# Carica un file STL — deve mostrare il modello 3D ruotabile
# Test: drag-and-drop deve funzionare
# Test: bottone "Carica STL" deve aprire il file picker
# Test: il modello deve centrarsi automaticamente
```

**Step 6: Commit**
```bash
git add .
git commit -m "feat: STL viewer con drag-and-drop e orbit controls"
```

---

## Task 4: Analisi geometria mesh — Curvatura

**Obiettivo:** Calcolare la curvatura di ogni vertice della mesh STL per identificare feature geometriche

**Files:**
- Create: `src/lib/mesh-analysis.ts`
- Create: `src/lib/curvature.ts`

**Step 1: Crea il modulo curvatura**
```tsx
// src/lib/curvature.ts
import * as THREE from 'three'

/**
 * Calcola la curvatura Gaussiana per ogni vertice della mesh.
 * La curvatura Gaussiana K = k1 * k2 dove k1, k2 sono le curvature principali.
 * - K > 0: superficie convessa (come una sfera)
 * - K < 0: superficie a sella (come il solco tra due parti)
 * - K ≈ 0: superficie piatta o cilindrica
 */
export function computeGaussianCurvature(geometry: THREE.BufferGeometry): Float32Array {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const idx = geometry.getIndex()
  const vertexCount = pos.count
  const curvature = new Float32Array(vertexCount)

  if (!idx) return curvature

  // Per ogni vertice, stima la curvatura dal cambiamento di normale
  // tra le facce adiacenti (approssimazione discreta)
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute
  if (!normals) {
    geometry.computeVertexNormals()
  }

  // Accumula la deviazione angolare delle normali per vertice
  const angleSum = new Float32Array(vertexCount)
  const neighborCount = new Uint32Array(vertexCount)

  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3()
  const nA = new THREE.Vector3(), nB = new THREE.Vector3(), nC = new THREE.Vector3()

  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2)

    nA.fromBufferAttribute(normals || geometry.getAttribute('normal'), a)
    nB.fromBufferAttribute(normals || geometry.getAttribute('normal'), b)
    nC.fromBufferAttribute(normals || geometry.getAttribute('normal'), c)

    // Deviazione angolare media tra normali adiacenti
    angleSum[a] += (1 - nA.dot(nB)) + (1 - nA.dot(nC))
    angleSum[b] += (1 - nB.dot(nA)) + (1 - nB.dot(nC))
    angleSum[c] += (1 - nC.dot(nA)) + (1 - nC.dot(nB))

    neighborCount[a] += 2
    neighborCount[b] += 2
    neighborCount[c] += 2
  }

  for (let i = 0; i < vertexCount; i++) {
    curvature[i] = neighborCount[i] > 0 ? angleSum[i] / neighborCount[i] : 0
  }

  return curvature
}

/**
 * Trova i vertici con curvatura alta (feature edges / solchi)
 */
export function findHighCurvatureVertices(
  curvature: Float32Array,
  threshold: number = 0.5
): number[] {
  const indices: number[] = []
  // Calcola la soglia come percentile
  const sorted = Array.from(curvature).sort((a, b) => a - b)
  const percentile = sorted[Math.floor(sorted.length * threshold)]

  for (let i = 0; i < curvature.length; i++) {
    if (curvature[i] > percentile) {
      indices.push(i)
    }
  }
  return indices
}
```

**Step 2: Crea il modulo analisi mesh**
```tsx
// src/lib/mesh-analysis.ts
import * as THREE from 'three'
import { computeGaussianCurvature, findHighCurvatureVertices } from './curvature'

export interface MeshAnalysisResult {
  vertexCount: number
  faceCount: number
  boundingBox: THREE.Box3
  boundingSphere: THREE.Sphere
  curvature: Float32Array
  highCurvatureIndices: number[]
  cylinderCandidates: CylinderCandidate[]
}

export interface CylinderCandidate {
  center: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  height: number
  vertexIndices: number[]
  confidence: number // 0-1
}

/**
 * Analisi completa della mesh — punto di ingresso
 */
export function analyzeMesh(geometry: THREE.BufferGeometry): MeshAnalysisResult {
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.computeVertexNormals()

  const curvature = computeGaussianCurvature(geometry)
  const highCurvatureIndices = findHighCurvatureVertices(curvature)
  const cylinderCandidates = detectCylinders(geometry)

  return {
    vertexCount: geometry.getAttribute('position').count,
    faceCount: geometry.getIndex()?.count ? Math.floor(geometry.getIndex()!.count / 3) : 0,
    boundingBox: geometry.boundingBox!,
    boundingSphere: geometry.boundingSphere!,
    curvature,
    highCurvatureIndices,
    cylinderCandidates,
  }
}

/**
 * Rileva cilindri nella mesh (impianti dentali).
 * Strategia: RANSAC su assi di simmetria cilindrica.
 * 1. Campiona triple di vertici casuali
 * 2. Per ogni terna, calcola l'asse del cilindro passante
 * 3. Conta quanti vertici sono vicini a quel cilindro
 * 4. Se abbastanza vertici concordano → candidato cilindro
 */
export function detectCylinders(
  geometry: THREE.BufferGeometry,
  minRadius: number = 1.5,  // mm - raggio minimo impianto
  maxRadius: number = 4.0,  // mm - raggio massimo impianto
  minInlierRatio: number = 0.01, // min 1% dei vertici
  iterations: number = 500
): CylinderCandidate[] {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const vertexCount = pos.count
  const vertices: THREE.Vector3[] = []

  for (let i = 0; i < vertexCount; i++) {
    vertices.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
  }

  const candidates: CylinderCandidate[] = []
  const used = new Set<number>()

  for (let iter = 0; iter < iterations; iter++) {
    // Campiona 3 vertici casuali
    const i = Math.floor(Math.random() * vertexCount)
    const j = Math.floor(Math.random() * vertexCount)
    const k = Math.floor(Math.random() * vertexCount)

    if (i === j || j === k || i === k) continue

    // Calcola l'asse del cilindro approssimato
    const p1 = vertices[i], p2 = vertices[j], p3 = vertices[k]

    // Il piano passante per i 3 punti
    const v12 = new THREE.Vector3().subVectors(p2, p1)
    const v13 = new THREE.Vector3().subVectors(p3, p1)
    const normal = new THREE.Vector3().crossVectors(v12, v13).normalize()

    if (normal.length() < 0.01) continue

    // Centro approssimato
    const center = new THREE.Vector3().addVectors(p1, p2).add(p3).divideScalar(3)

    // Raggio approssimato (distanza media dal centro sul piano)
    const d1 = new THREE.Vector3().subVectors(p1, center).dot(normal.clone().negate())
    const r1 = p1.distanceTo(center.clone().add(normal.clone().multiplyScalar(d1)))
    const r2 = p2.distanceTo(center.clone().add(normal.clone().multiplyScalar(
      new THREE.Vector3().subVectors(p2, center).dot(normal.clone().negate())
    )))

    const avgRadius = (r1 + r2) / 2

    if (avgRadius < minRadius || avgRadius > maxRadius) continue

    // Conta inlier — vertici vicini al cilindro candidato
    const inlierIndices: number[] = []
    const tolerance = avgRadius * 0.15 // 15% di tolleranza

    for (let vi = 0; vi < vertexCount; vi++) {
      const v = vertices[vi]
      const projDist = Math.abs(v.clone().sub(center).dot(normal))
      const perpDist = v.clone().sub(center).sub(normal.clone().multiplyScalar(projDist)).length()
      if (Math.abs(perpDist - avgRadius) < tolerance) {
        inlierIndices.push(vi)
      }
    }

    const inlierRatio = inlierIndices.length / vertexCount

    if (inlierRatio >= minInlierRatio) {
      // Calcola proprietà del cilindro
      const inlierVertices = inlierIndices.map(idx => vertices[idx])
      const cylCenter = new THREE.Vector3()
      inlierVertices.forEach(v => cylCenter.add(v))
      cylCenter.divideScalar(inlierVertices.length)

      // Verifica che non sia sovrapposto a un candidato esistente
      const isDuplicate = candidates.some(c =>
        c.center.distanceTo(cylCenter) < avgRadius * 2
      )

      if (!isDuplicate) {
        candidates.push({
          center: cylCenter,
          axis: normal,
          radius: avgRadius,
          height: 0, // calcolata dopo
          vertexIndices: inlierIndices,
          confidence: Math.min(inlierRatio * 10, 1), // normalizza
        })
      }
    }
  }

  // Ordina per confidenza e ritorna i migliori
  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10) // max 10 impianti
}
```

**Step 3: Verifica compilazione**
```bash
npx tsc --noEmit
# Nessun errore TypeScript
```

**Step 4: Commit**
```bash
git add .
git commit -m "feat: analisi curvatura mesh e rilevamento cilindri RANSAC"
```

---

## Task 5: Visualizzazione impianti rilevati

**Obiettivo:** Evidenziare i cilindri rilevati (impianti) nel viewer con colore e etichette

**Files:**
- Modify: `src/components/viewer/stl-model.tsx`
- Create: `src/components/viewer/implant-marker.tsx`
- Modify: `src/components/viewer/viewer-section.tsx`

**Step 1: Crea il marker impianto**
```tsx
// src/components/viewer/implant-marker.tsx
'use client'

import { useRef } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'

interface ImplantMarkerProps {
  center: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  confidence: number
  index: number
  isSelected?: boolean
  onClick?: () => void
}

export function ImplantMarker({
  center, axis, radius, confidence, index, isSelected, onClick
}: ImplantMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  return (
    <group>
      {/* Sfera al centro dell'impianto */}
      <mesh
        ref={meshRef}
        position={center}
        onClick={onClick}
      >
        <sphereGeometry args={[radius * 1.2, 32, 32]} />
        <meshStandardMaterial
          color={isSelected ? '#f59e0b' : '#ef4444'}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Linea dell'asse */}
      <line
        points={[
          center.clone().add(axis.clone().multiplyScalar(-radius * 3)),
          center.clone().add(axis.clone().multiplyScalar(radius * 3)),
        ]}
        color={isSelected ? '#f59e0b' : '#ef4444'}
        lineWidth={2}
      />

      {/* Etichetta */}
      <Html position={center.clone().add(new THREE.Vector3(0, radius * 2, 0))} center>
        <div className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap
          ${isSelected ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'}`}>
          Impianto {index + 1}
          <br />R: {radius.toFixed(1)}mm
          <br />Conf: {(confidence * 100).toFixed(0)}%
        </div>
      </Html>
    </group>
  )
}
```

**Step 2: Aggiorna StlModel per comunicare la geometria**
```tsx
// Modifica in src/components/viewer/stl-model.tsx
// Aggiungi la callback onGeometryReady e l'uso di analyzeMesh

interface StlModelProps {
  url: string
  onAnalysisComplete?: (result: MeshAnalysisResult) => void
}

export function StlModel({ url, onAnalysisComplete }: StlModelProps) {
  const geometry = useLoader(STLLoader, url)
  const meshRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    if (!geometry) return
    // Centra e scala (come prima)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    const center = new THREE.Vector3()
    box.getCenter(center)
    geometry.translate(-center.x, -center.y, -center.z)

    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      const scale = 80 / maxDim
      geometry.scale(scale, scale, scale)
    }
    geometry.computeVertexNormals()

    // NUOVO: Esegui analisi mesh
    const result = analyzeMesh(geometry)
    onAnalysisComplete?.(result)
  }, [geometry])

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial color="#a0c4ff" metalness={0.2} roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  )
}
```

**Step 3: Aggiorna viewer-section per mostrare impianti**
```tsx
// Aggiungi stato per gli impianti e passali al Canvas
// Nel componente ViewerSection:
const [analysisResult, setAnalysisResult] = useState<MeshAnalysisResult | null>(null)
const [selectedImplant, setSelectedImplant] = useState<number | null>(null)

// Nell'HTML della sidebar, mostra conteggio impianti:
{analysisResult ? (
  <div className="space-y-2">
    <p className="text-sm font-medium">
      {analysisResult.cylinderCandidates.length} impianto/i rilevato/i
    </p>
    {analysisResult.cylinderCandidates.map((cyl, i) => (
      <div key={i} className={`p-2 rounded text-xs cursor-pointer
        ${selectedImplant === i ? 'bg-amber-500/20 border border-amber-500' : 'bg-muted'}`}
        onClick={() => setSelectedImplant(i === selectedImplant ? null : i)}
      >
        <p className="font-medium">Impianto {i + 1}</p>
        <p>Raggio: {cyl.radius.toFixed(1)}mm</p>
        <p>Confidenza: {(cyl.confidence * 100).toFixed(0)}%</p>
      </div>
    ))}
  </div>
) : (
  <p className="text-sm text-muted-foreground">Carica un STL</p>
)}
```

**Step 4: Verifica**
```bash
npm run dev
# Carica un STL con impianti
# I cilindri devono apparire come sfere rosse semitrasparenti
# Click su un impianto → si evidenzia in giallo
# Sidebar mostra la lista degli impianti con dati
```

**Step 5: Commit**
```bash
git add .
git commit -m "feat: visualizzazione impianti rilevati con marker ed etichette"
```

---

## Task 6: Visualizzazione curvatura (heat map)

**Obiettivo:** Mostrare una mappa di calore della curvatura sulla superficie del modello — aiuta l'utente a capire dove l'AI vede le feature

**Files:**
- Create: `src/components/viewer/curvature-visualization.tsx`
- Modify: `src/components/viewer/stl-model.tsx`

**Step 1: Crea il componente curvatura visiva**
```tsx
// src/components/viewer/curvature-visualization.tsx
'use client'

import * as THREE from 'three'

interface CurvatureVisualizationProps {
  geometry: THREE.BufferGeometry
  curvature: Float32Array
  opacity: number // 0-1, controllato da slider
}

/**
 * Colora i vertici in base alla curvatura:
 * - Blu = curvatura bassa (superficie piatta/liscia)
 * - Verde = curvatura media
 * - Giallo = curvatura alta (spigoli, transizioni)
 * - Rosso = curvatura molto alta (solchi, feature)
 */
export function curvatureToColor(curvature: Float32Array): Float32Array {
  const colors = new Float32Array(curvature.length * 3)

  // Normalizza curvatura a 0-1
  let maxCurv = 0
  for (let i = 0; i < curvature.length; i++) {
    if (curvature[i] > maxCurv) maxCurv = curvature[i]
  }
  if (maxCurv === 0) maxCurv = 1

  for (let i = 0; i < curvature.length; i++) {
    const t = Math.min(curvature[i] / maxCurv, 1)
    let r: number, g: number, b: number

    if (t < 0.25) {
      // Blu → Ciano
      r = 0; g = t * 4; b = 1
    } else if (t < 0.5) {
      // Ciano → Verde
      r = 0; g = 1; b = 1 - (t - 0.25) * 4
    } else if (t < 0.75) {
      // Verde → Giallo
      r = (t - 0.5) * 4; g = 1; b = 0
    } else {
      // Giallo → Rosso
      r = 1; g = 1 - (t - 0.75) * 4; b = 0
    }

    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }

  return colors
}
```

**Step 2: Aggiungi toggle nella toolbar**
```tsx
// Nella toolbar del viewer, aggiungi un toggle per la heat map:
<Button
  variant={showCurvature ? 'default' : 'outline'}
  size="sm"
  onClick={() => setShowCurvature(!showCurvature)}
>
  Curvatura
</Button>

{showCurvature && (
  <div className="flex items-center gap-2">
    <span className="text-xs">Opacità</span>
    <Slider
      min={0} max={100} defaultValue={[70]}
      onValueChange={([v]) => setCurvatureOpacity(v / 100)}
      className="w-24"
    />
  </div>
)}
```

**Step 3: Verifica**
```bash
npm run dev
# Carica STL → clicca "Curvatura" nella toolbar
# La superficie deve colorarsi: blu (piatto) → rosso (curvo)
# Slider opacità deve funzionare
```

**Step 4: Commit**
```bash
git add .
git commit -m "feat: heat map curvatura con toggle e slider opacità"
```

---

## Task 7: Tool di annotazione (per raccogliere dati ML)

**Obiettivo:** Permettere all'utente di disegnare manualmente le linee di taglio sull'STL. Ogni annotazione viene salvata come dato di training per la Fase 8 (ML).

**Files:**
- Create: `src/components/viewer/annotation-tool.tsx`
- Create: `src/lib/annotations.ts`
- Create: `src/app/api/annotations/route.ts`

**Step 1: Crea il tipo annotazione**
```tsx
// src/lib/annotations.ts
export interface Annotation {
  id: string
  stlFileName: string
  createdAt: string
  implantCount: number
  cutLinePoints: number[][] // array di [x, y, z] — punti sulla superficie
  profile: 'oval' | 'd-shape' | 'rectangular' | 'custom'
  thickness: number // mm
  notes: string
}

export function saveAnnotation(annotation: Annotation): void {
  const existing = JSON.parse(localStorage.getItem('shen3d-annotations') || '[]')
  existing.push(annotation)
  localStorage.setItem('shen3d-annotations', JSON.stringify(existing))
}

export function getAnnotations(): Annotation[] {
  return JSON.parse(localStorage.getItem('shen3d-annotations') || '[]')
}
```

**Step 2: Crea il tool di disegno**
```tsx
// src/components/viewer/annotation-tool.tsx
'use client'

import { useState, useCallback } from 'react'
import * as THREE from 'three'
import { Button } from '@/components/ui/button'
import { saveAnnotation, Annotation } from '@/lib/annotations'

interface AnnotationToolProps {
  stlFileName: string
  implantCount: number
  onAnnotationComplete?: (annotation: Annotation) => void
}

/**
 * Tool che permette di cliccare sulla superficie dell'STL
 * per posizionare punti di una linea di taglio.
 * Ogni click aggiunge un punto. "Salva" crea l'annotazione.
 */
export function AnnotationTool({ stlFileName, implantCount, onAnnotationComplete }: AnnotationToolProps) {
  const [points, setPoints] = useState<THREE.Vector3[]>([])
  const [notes, setNotes] = useState('')
  const [profile, setProfile] = useState<Annotation['profile']>('oval')
  const [thickness, setThickness] = useState(1.5)

  const addPoint = useCallback((point: THREE.Vector3) => {
    setPoints(prev => [...prev, point.clone()])
  }, [])

  const undoPoint = useCallback(() => {
    setPoints(prev => prev.slice(0, -1))
  }, [])

  const save = useCallback(() => {
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      stlFileName,
      createdAt: new Date().toISOString(),
      implantCount,
      cutLinePoints: points.map(p => [p.x, p.y, p.z]),
      profile,
      thickness,
      notes,
    }
    saveAnnotation(annotation)
    onAnnotationComplete?.(annotation)
    setPoints([])
    setNotes('')
  }, [points, profile, thickness, notes, stlFileName, implantCount])

  return {
    points,
    addPoint,
    undoPoint,
    save,
    notes,
    setNotes,
    profile,
    setProfile,
    thickness,
    setThickness,
  }
}
```

**Step 3: Verifica**
```bash
npm run dev
# Carica STL → annota alcuni punti → salva
# Ricarica la pagina → le annotazioni devono persistere (localStorage)
```

**Step 4: Commit**
```bash
git add .
git commit -m "feat: tool annotazione per raccolta dati training ML"
```

---

## Task 8: Info modello nella sidebar

**Obiettivo:** Mostrare proprietà del modello (vertici, facce, dimensioni) e statistiche dell'analisi

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Step 1: Aggiorna sidebar con dati reali**
```tsx
// Aggiorna la sezione PROPRIETÀ nella sidebar:
{analysisResult ? (
  <div className="space-y-1 text-xs">
    <p>Vertici: {analysisResult.vertexCount.toLocaleString()}</p>
    <p>Facce: {analysisResult.faceCount.toLocaleString()}</p>
    <p>Feature: {analysisResult.highCurvatureIndices.length.toLocaleString()}</p>
    <p>Impianti: {analysisResult.cylinderCandidates.length}</p>
    <Separator className="my-2" />
    <p className="font-medium">DIMENSIONI</p>
    <p>L: {size.x.toFixed(1)}mm</p>
    <p>A: {size.y.toFixed(1)}mm</p>
    <p>P: {size.z.toFixed(1)}mm</p>
  </div>
) : (
  <p className="text-sm text-muted-foreground">Carica un STL</p>
)}
```

**Step 2: Verifica**
```bash
npm run dev
# Carica STL → sidebar deve mostrare tutti i dati
```

**Step 3: Commit**
```bash
git add .
git commit -m "feat: info modello e statistica analisi nella sidebar"
```

---

## Task 9: Export annotazioni per training

**Obiettivo:** Permettere di esportare tutte le annotazioni raccolte come JSON — pronto per il training ML della Fase 8

**Files:**
- Create: `src/lib/export-annotations.ts`
- Modify: `src/components/layout/sidebar.tsx`

**Step 1: Crea funzione export**
```tsx
// src/lib/export-annotations.ts
import { getAnnotations, Annotation } from './annotations'

export function exportAnnotationsAsJSON(): string {
  const annotations = getAnnotations()
  return JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    totalAnnotations: annotations.length,
    annotations,
  }, null, 2)
}

export function downloadAnnotations(): void {
  const json = exportAnnotationsAsJSON()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shen3d-annotations-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}
```

**Step 2: Aggiungi bottone export nella sidebar**
```tsx
<Button
  variant="outline"
  size="sm"
  className="w-full"
  onClick={downloadAnnotations}
  disabled={annotationCount === 0}
>
  📥 Export Annotazioni ({annotationCount})
</Button>
```

**Step 3: Verifica**
```bash
npm run dev
# Annota qualche punto → clicca Export → scarica il JSON
# Il JSON deve contenere tutti i dati strutturati
```

**Step 4: Commit**
```bash
git add .
git commit -m "feat: export annotazioni come JSON per training ML"
```

---

## Task 10: Test e polish finale

**Obiettivo:** Verificare che tutto funzioni insieme, fixare bug, aggiungere loading states

**Files:**
- Modify: vari file per fix e polish

**Step 1: Test manuale completo**
```
1. Apri app → deve mostrare drop zone
2. Carica STL via drag-and-drop → modello visibile
3. Carica STL via bottone → stesso risultato
4. Rotazione col mouse → fluida
5. Zoom → fluido
6. Impianti evidenziati in rosso → visibili
7. Click su impianto → diventa giallo
8. Sidebar mostra dati → corretti
9. Toggle curvatura → heat map visibile
10. Slider opacità → funziona
11. Annota punti → compaiono come sfere
12. Salva annotazione → persiste
13. Export annotazioni → JSON scaricato
```

**Step 2: Aggiungi loading state per l'analisi**
```tsx
const [isAnalyzing, setIsAnalyzing] = useState(false)

// Quando l'analisi parte:
setIsAnalyzing(true)
// Quando completa:
setIsAnalyzing(false)

// Nella UI:
{isAnalyzing && (
  <div className="absolute top-4 right-4 bg-card border rounded-lg p-3 shadow-lg z-10">
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">Analisi in corso...</span>
    </div>
  </div>
)}
```

**Step 3: Commit finale**
```bash
git add .
git commit -m "feat: Fase 1 completa — STL viewer + rilevamento impianti + annotazioni"
```

---

## Riepilogo Fase 1

| Task | Cosa | Tempo |
|------|------|-------|
| 1 | Setup progetto | 15 min |
| 2 | Layout base | 30 min |
| 3 | STL viewer R3F | 45 min |
| 4 | Analisi curvatura + cilindri | 1 ora |
| 5 | Visualizzazione impianti | 45 min |
| 6 | Heat map curvatura | 30 min |
| 7 | Tool annotazione | 1 ora |
| 8 | Info sidebar | 30 min |
| 9 | Export annotazioni | 30 min |
| 10 | Test e polish | 1 ora |

**Totale: ~6 ore di lavoro Claude Code**

**Risultato finale:** Una web app dove carichi un STL, vedi il modello 3D, gli impianti sono evidenziati automaticamente, puoi visualizzare la curvatura, e puoi annotare le linee di taglio che diventeranno dati di training per la Fase 8.

---

## Il prompt per Claude Code

Quando sei pronto, incolla questo in Claude Code nel progetto:

```
Sto costruendo Shen3D — un tool web per scomporre ponti dentali STL su impianti.

Leggi il file di piano: shen3d-fase1-plan.md

Obiettivo: Implementa la Fase 1 completa — tutti i 10 task.

Stack: Next.js 14 App Router + TypeScript + Tailwind CSS + shadcn/ui + React Three Fiber + Drei + three-mesh-bvh

Regole:
- Componenti sempre 'use client' se usano React hooks o R3F
- TypeScript strict — niente any
- Ogni componente deve funzionare da solo
- Commit dopo ogni task
- Se un test manuale fallisce, correggi prima di procedere

Inizia dal Task 1 e procedi in ordine. Dopo ogni task, conferma che funziona.
```
