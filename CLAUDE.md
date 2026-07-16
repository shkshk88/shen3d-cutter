# Shen3D — iBar Splitter (Cutter Parametrico AI)

## Cos'è
Tool web che replica la funzione **iBar di B4D** (equivalente allo Split Bar di exocad 3.3): scompone una protesi ibrida monolitica avvitata su impianti in due parti combacianti. L'utente carica l'STL monolitico, il sistema rileva i camini vite dalla mesh, propone una curva di split che l'utente modifica interattivamente, e il backend genera **barra primaria** (struttura interna) + **sovrastruttura** (guscio estetico) con gap cemento variabile, blockout dei sottosquadri lungo l'asse di inserzione e camini vite preservati.

## Stack
- **Framework:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **3D:** @react-three/fiber + @react-three/drei + three-mesh-bvh + three-stdlib
- **Geometria pesante (server):** Python FastAPI + **Blender headless (bpy)** — boolean EXACT, offset, blockout
- **Verifica mesh (server):** trimesh + manifold3d
- **AI (geometrica):** Algoritmi custom TS (curvatura, rilevamento camini vite, proposta curva di split)
- **AI (ML futuro):** proposta curva appresa dalle annotazioni accumulate

## Architettura
```
BROWSER                              SERVER (VPS)
┌──────────────────────────┐         ┌─────────────────────────┐
│ Viewer STL (mm reali)    │         │ FastAPI (server/app.py) │
│ R3F + Drei + BVH         │  API    │  job async + polling    │
│                          │ ←────→  │        ↓ subprocess     │
│ Rilevamento camini vite  │ Next.js │ Blender headless (bpy)  │
│ curvatura + fit cilindri │  proxy  │  pipeline S1–S10        │
│                          │         │        ↓                │
│ Editor curva di split    │         │ checks: trimesh +       │
│ + parametri (gap, ecc.)  │         │ manifold3d              │
│                          │         └─────────────────────────┘
│ Preview risultato        │
└──────────────────────────┘
```

## Comandi
- `npm run dev` — Avvia dev server su localhost:3000
- `npm run build` — Build produzione
- `npm run lint` — ESLint
- `python -m uvicorn server.app:app --port 8001` — Backend geometrico (Fase 9+)

## Standard Codice
- Sempre `'use client'` per componenti con hooks/R3F
- TypeScript strict — niente `any`
- Componenti devono funzionare da soli
- Import alias `@/*` → `src/*`
- Tailwind CSS per styling — niente CSS module separati
- shadcn/ui per componenti UI (Button, Card, Slider, etc.)
- Sempre `next/dynamic` con `ssr: false` per componenti R3F/Canvas

## 3D Viewer Rules
- STL caricati via STLLoader di three-stdlib
- **Coordinate in mm reali:** MAI traslare/scalare la geometria — la vista si adatta con la camera (drei `Bounds`). I parametri clinici (gap cemento in µm, raggi/assi canali, curva di split) viaggiano verso il backend nel frame originale del file STL
- OrbitControls per rotazione/zoom/pan
- Calcolare sempre vertexNormals dopo il load
- `geometry.computeBoundsTree()` (three-mesh-bvh) al load: raycast accelerato per editor curva, detection e annotazioni
- Niente `@react-three/postprocessing` — inutile per CAD

## Analisi Mesh Rules
- Curvatura discreta per vertice (deviazione normali) — usata per heat map e rilevamento creste/rim
- **Camini vite:** rilevati come pareti tubolari interne — creste di curvatura → clustering → fit cerchio (PCA + Taubin, raggio 0.8–3.0mm) → pairing rim occlusale/intaglio → raffinamento asse via covarianza delle normali → validazione raycast BVH
- Asse di inserzione = media assi camini, regolabile dall'utente
- Heat map curvatura: blu→ciano→verde→giallo→rosso
- Soglia curvatura alta = percentile 50% dei valori

## Pipeline Split (server, Blender/bpy)
Stage S1–S10 in `server/blender_ops/split_bar.py`: import+validazione → solido H dalla curva → barra base (∩) → camini anulari → barra B (∪) → dilatazione gap (offset normali, NO voxel remesh) → volume ombra lungo asse inserzione (raddoppio unioni booleane) → sovrastruttura S = originale − ombra → ri-foratura difensiva canali su S → export 2 STL watertight + report.json. Mai voxel-remesh dell'STL originale (interfacce implantari esatte).

## Parametri default
- Gap cemento: 80µm (range 30–150)
- Parete camino: 0.5mm (range 0.3–1.0)
- Spessore minimo barra: 2.0mm (warning, non enforcement)
- Passo blockout: 0.2mm

## Git
- Branch: `main`
- Commit format: `feat:`, `fix:`, `docs:`
- Commit dopo ogni task completato

## Fasi di Sviluppo
- Fasi 1–5 (viewer, curvatura, piani di taglio parametrici, taglio planare server): completate, vedi `shen3d-fase[1235]-plan.md`
- **Fasi 6–11 (pivot iBar):** vedi `shen3d-fase6-plan.md` e successivi — fondamenta mm, rilevamento camini, editor curva, backend Blender, pipeline completa, revisione

## Design System
- Dark theme di default (`<html lang="it" className="dark">`)
- Font: Inter (sans-serif)
- Colori primari: Indigo (#6366f1) per azioni, Red (#ef4444) per impianti/camini, Amber (#f59e0b) per selezione/curva di split, Green (#10b981) per conferme
- Background: slate-950 per main, card per sidebar
- Glass effect per toolbar (backdrop-blur)
