# Shen3D — Fase 5: Taglio Reale + Libreria Profili + Export

> **Per Claude Code:** Implementare task per task. Ogni task è autosufficiente.

## Obiettivo

L'utente carica STL, l'AI propone il taglio (Fase 2-3 già fatto), l'utente lo modifica (Fase 3), poi clicca **"Taglia"** → il server Python taglia realmente il STL in 2 parti → l'utente scarica i 2 file STL separati. Inoltre può scegliere profili standard (D4, D4.5) generati con OpenSCAD.

## Strumenti installati sul VPS

| Strumento | Stato | Uso |
|---|---|---|
| **trimesh + manifold3d** | ✅ Python 3.11 | Booleane veloci, split STL con piano |
| **OpenSCAD** | ✅ v2021.01 | Generazione profili parametrici |
| **FreeCAD** | ✅ v1.0.0 (conda) | Operazioni avanzate (se trimesh non basta) |
| **Cutter API** | ✅ Port 8001 | Server Python HTTP che espone trimesh + OpenSCAD |
| **R3F + Drei** | ✅ Browser | Visualizzazione 3D |
| **three-mesh-bvh** | ✅ Browser | Analisi mesh veloce |

## Cutter API Reference (già attiva su localhost:8001)

### GET /api/health
```json
{ "status": "ok", "engines": { "trimesh": true, "freecad": false, "openscad": true } }
```

### POST /api/upload
Upload binary STL → ritorna `{ "stl_path": "/tmp/shen3d-output/upload_xxxx.stl", "size": 12345 }`

### POST /api/split
```json
{
  "stl_path": "/path/to/file.stl",
  "plane_normal": [0, 0, 1],
  "plane_point": [0, 0, 0],
  "engine": "trimesh"
}
```
Ritorna:
```json
{
  "upper": { "path": "/tmp/shen3d-output/upper_xxxx.stl", "vertices": 500, "faces": 1000 },
  "lower": { "path": "/tmp/shen3d-output/lower_xxxx.stl", "vertices": 480, "faces": 960 },
  "engine": "trimesh"
}
```

### GET /api/download/{filename}
Scarica il file STL generato (upper/lower/profile)

### POST /api/profile
```json
{ "type": "d_shape", "params": { "width": 4, "height": 3, "depth": 2 } }
```
Tipi: `d_shape`, `oval`, `rectangular`
Ritorna: `{ "stl_path": "...", "vertices": 104, "faces": 204 }`

### GET /api/info?stl=/path/to/file.stl
Info sul file STL (vertices, faces, bounds, volume, area)

---

## Task 1: Proxy API nel Next.js app

**Obiettivo:** Creare API routes nel Next.js che forwardano le richieste al Cutter API Python

**File:** `src/app/api/cut/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

const CUTTER_API = process.env.CUTTER_API_URL || 'http://localhost:8001'

export async function POST(req: NextRequest) {
  const body = await req.json()
  
  const res = await fetch(`${CUTTER_API}/api/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
```

**File:** `src/app/api/profile/route.ts` — proxy per `/api/profile`

**File:** `src/app/api/cutter/[...path]/route.ts` — proxy generico per download e altri endpoint

**Step:** Crea i file. Commit: `feat: Next.js API proxy for Cutter Python server`

---

## Task 2: Upload STL al server Python

**Obiettivo:** Quando l'utente carica un STL nel browser, inviarlo anche al server Python per il processing

**File:** `src/lib/cutter-client.ts`

```typescript
const CUTTER_API = process.env.NEXT_PUBLIC_CUTTER_API_URL || ''

export async function uploadStlToServer(file: File): Promise<{ stl_path: string; size: number }> {
  const arrayBuffer = await file.arrayBuffer()
  
  const res = await fetch(`${CUTTER_API}/api/upload`, {
    method: 'POST',
    body: arrayBuffer,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
  
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export async function splitStl(
  stlPath: string, 
  planeNormal: [number, number, number], 
  planePoint: [number, number, number],
  engine: 'trimesh' | 'freecad' = 'trimesh'
): Promise<SplitResult> {
  const res = await fetch(`${CUTTER_API}/api/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stl_path: stlPath, plane_normal: planeNormal, plane_point: planePoint, engine }),
  })
  
  if (!res.ok) throw new Error('Split failed')
  return res.json()
}

export async function getDownloadUrl(filename: string): Promise<string> {
  return `${CUTTER_API}/api/download/${filename}`
}

export interface SplitResult {
  upper?: { path: string; vertices: number; faces: number; volume?: number | null }
  lower?: { path: string; vertices: number; faces: number; volume?: number | null }
  engine: string
  error?: string
}
```

**Step:** Crea il file. Commit: `feat: Cutter API client for STL split operations`

---

## Task 3: Pulsante "Taglia" nella UI

**Obiettivo:** Aggiungere il pulsante "Taglia" nel toolbar che esegue il taglio reale

**File:** `src/components/viewer/viewer-section.tsx` (modifica)

Quando un piano di taglio è selezionato:
1. Mostra pulsante **"✂️ Taglia"** (verde, prominente)
2. Al click:
   a. Prende il file STL caricato, la normale e il punto del piano selezionato
   b. Chiama `uploadStlToServer()` → `splitStl()` via proxy
   c. Mostra loading spinner "Taglio in corso..."
   d. Al risultato, mostra popup con:
      - "Parte superiore: X vertici, Y facce" + pulsante download
      - "Parte inferiore: X vertici, Y facce" + pulsante download
3. Error handling: se il taglio fallisce, mostra messaggio d'errore

**File:** `src/components/viewer/split-result-dialog.tsx` (nuovo)

Dialog/modale che mostra il risultato del taglio con:
- 2 card (superiore/inferiore) con preview info
- Pulsanti "Scarica STL" per ciascuna
- Pulsante "Chiudi"

**Step:** Crea e modifica i file. Commit: `feat: real STL cut button with server-side trimesh`

---

## Task 4: Download dei file STL tagliati

**Obiettivo:** Permettere il download dei 2 file STL separati

**File:** `src/app/api/download/[filename]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

const CUTTER_API = process.env.CUTTER_API_URL || 'http://localhost:8001'

export async function GET(
  req: NextRequest,
  { params }: { params: { filename: string } }
) {
  const res = await fetch(`${CUTTER_API}/api/download/${params.filename}`)
  
  if (!res.ok) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  
  const data = await res.arrayBuffer()
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${params.filename}"`,
    },
  })
}
```

Nel dialog (Task 3), i pulsanti "Scarica" puntano a `/api/download/{filename}`.

**Step:** Crea il file. Commit: `feat: STL download proxy for split results`

---

## Task 5: Libreria profili dentali

**Obiettivo:** Mostrare profili standard selezionabili (D4, D4.5, ecc.) generati con OpenSCAD

**File:** `src/lib/profiles.ts`

```typescript
export interface DentalProfile {
  id: string
  name: string
  type: 'd_shape' | 'oval' | 'rectangular'
  description: string
  params: Record<string, number>
}

// Standard dental implant profiles
export const DENTAL_PROFILES: DentalProfile[] = [
  {
    id: 'd4',
    name: 'D4 Standard',
    type: 'd_shape',
    description: 'Profilo D-shape per impianti Ø4mm',
    params: { width: 4, height: 3, depth: 2 },
  },
  {
    id: 'd4.5',
    name: 'D4.5 Wide',
    type: 'd_shape',
    description: 'Profilo D-shape per impianti Ø4.5mm',
    params: { width: 4.5, height: 3.5, depth: 2 },
  },
  {
    id: 'd5',
    name: 'D5 Wide Body',
    type: 'd_shape',
    description: 'Profilo D-shape per impianti Ø5mm',
    params: { width: 5, height: 4, depth: 2.5 },
  },
  {
    id: 'oval-narrow',
    name: 'Ovale Stretto',
    type: 'oval',
    description: 'Profilo ovale per ponti stretti',
    params: { width: 3.5, height: 4, depth: 2 },
  },
  {
    id: 'oval-wide',
    name: 'Ovale Largo',
    type: 'oval',
    description: 'Profilo ovale per ponti larghi',
    params: { width: 5, height: 6, depth: 2.5 },
  },
  {
    id: 'rect-standard',
    name: 'Rettangolare Standard',
    type: 'rectangular',
    description: 'Profilo rettangolare con raccordi',
    params: { width: 4, height: 3, depth: 2, fillet: 0.5 },
  },
]
```

**Step:** Crea il file. Commit: `feat: dental profile library definitions`

---

## Task 6: Selettore profili nella sidebar

**Obiettivo:** Mostrare la libreria profili nella sidebar, permettere preview e download

**File:** `src/components/layout/sidebar.tsx` (modifica)

Aggiungi sezione "Profili" nella sidebar:
1. Lista dei profili (da `DENTAL_PROFILES`)
2. Ogni profilo: icona colore + nome + descrizione breve
3. Click su un profilo → chiama `/api/profile` → preview 3D del profilo
4. Pulsante "Scarica STL" per esportare il profilo

**File:** `src/components/viewer/profile-preview.tsx` (nuovo)

Mini viewer R3F che mostra il profilo selezionato in 3D (rotante).

**Step:** Crea e modifica i file. Commit: `feat: profile selector in sidebar with 3D preview`

---

## Task 7: Variabile d'ambiente CUTTER_API_URL

**Obiettivo:** Configurare l'URL del server Python

**File:** `.env.local`

```
CUTTER_API_URL=http://localhost:8001
NEXT_PUBLIC_CUTTER_API_URL=
```

NOTA: `NEXT_PUBLIC_CUTTER_API_URL` è vuoto in produzione perché le chiamate passano tramite il proxy Next.js (`/api/cut`, `/api/profile`, `/api/download`). Solo il server Next.js ha bisogno di `CUTTER_API_URL`.

Per Vercel: aggiungere env var `CUTTER_API_URL` nelle impostazioni del progetto.

**Step:** Crea il file. Commit: `feat: environment config for Cutter API`

---

## Task 8: Build + test + deploy

**Obiettivo:** Verificare tutto end-to-end

1. `npm run build` passa
2. Test locale: carica STL → seleziona piano → Taglia → scarica 2 parti
3. Test profili: seleziona D4 → preview 3D → scarica STL
4. Push su GitHub
5. Deploy Vercel
6. Verifica da iPhone

Commit finale: `feat: phase 5 complete — real STL cutting, profiles, export`

---

## Note importanti

- **Il server Python gira sul VPS** su porta 8001 (systemd service `shen3d-cutter-api`)
- **Next.js proxy** inoltra le richieste dal browser al server Python
- **trimesh** è il motore principale — veloce e headless
- **OpenSCAD** genera i profili parametrici — headless via CLI
- **FreeCAD** (conda) è disponibile come fallback se trimesh non basta
- **Il browser non fa booleane** — solo visualizzazione e parametri
- **Il taglio reale** avviene sempre server-side
- **I file STL** vengono salvati in `/tmp/shen3d-output/` sul VPS
- **Niente OCCT.js** — eliminato dall'architettura
