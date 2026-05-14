# Shen3D — Cutter Parametrico AI

## Cos'è
Tool web per scomporre ponti dentali avvitati su impianti. L'utente carica un file STL, l'AI analizza la geometria e propone dove tagliare, l'utente modifica interattivamente il piano di taglio parametrico, e il sistema esporta le 2 parti separate.

## Stack
- **Framework:** Next.js 14 (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **3D:** @react-three/fiber + @react-three/drei + three-mesh-bvh
- **CAD Kernel (browser):** opencascade.js (WASM) — Fase 3+
- **CAD Kernel (server):** FreeCAD MCP — Fase 5+
- **AI (geometrica):** Algoritmi custom JS (curvatura, RANSAC cilindri)
- **AI (ML futuro):** PyTorch → ONNX Runtime Web

## Architettura
```
BROWSER                          SERVER (VPS)
┌──────────────────────┐         ┌──────────────────┐
│ Layer 1: Viewer STL  │         │ Layer 5:         │
│ R3F + Drei           │   API   │ Orchestratore AI│
│                      │ ←────→  │ Hermes + MCP     │
│ Layer 2: AI Module   │         │ FreeCAD MCP      │
│ Curvature + Cylinders│         │ OpenSCAD MCP     │
│                      │         └──────────────────┘
│ Layer 3: CAD Kernel  │
│ OpenCascade.js WASM  │
│                      │
│ Layer 4: Editor       │
│ Drag + Slider + Prof │
└──────────────────────┘
```

## Comandi
- `npm run dev` — Avvia dev server su localhost:3000
- `npm run build` — Build produzione
- `npm run lint` — ESLint

## Standard Codice
- Sempre `'use client'` per componenti con hooks/R3F
- TypeScript strict — niente `any`
- Componenti devono funzionare da soli
- Import alias `@/*` → `src/*`
- Tailwind CSS per styling — niente CSS module separati
- shadcn/ui per componenti UI (Button, Card, Slider, etc.)
- Sempre `next/dynamic` con `ssr: false` per componenti R3F/Canvas

## 3D Viewer Rules
- STL caricati via STLLoader di three-stdlib (Drei)
- OrbitControls per rotazione/zoom/pan
- Il modello va centrato e scalato a ~80 unità
- Calcolare sempre vertexNormals dopo trasformazioni
- Usare three-mesh-bvh per raycasting su mesh pesanti
- Niente `@react-three/postprocessing` — inutile per CAD

## Analisi Mesh Rules
- Curvatura Gaussiana discreta per vertice
- Rilevamento cilindri via RANSAC (impianti = cilindri raggio 1.5-4mm)
- Heat map curvatura: blu→ciano→verde→giallo→rosso
- Soglia curvatura alta = percentile 50% dei valori

## Git
- Branch: `main`
- Commit format: `feat:`, `fix:`, `docs:`
- Commit dopo ogni task completato

## Fasi di Sviluppo
Vedere `shen3d-fase1-plan.md` per il piano dettagliato Fase 1 (10 task).

## Design System
- Dark theme di default (`<html lang="it" className="dark">`)
- Font: Inter (sans-serif)
- Colori primari: Indigo (#6366f1) per azioni, Red (#ef4444) per impianti, Amber (#f59e0b) per selezione, Green (#10b981) per conferme
- Background: slate-950 per main, card per sidebar
- Glass effect per toolbar (backdrop-blur)
