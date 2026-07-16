# Shen3D — Fase 8: Editor Curva di Split

## Obiettivo
L'utente definisce DOVE separare barra e sovrastruttura disegnando una curva
chiusa sulla superficie della protesi (equivalente del tab "Split" di exocad 3.3),
partendo da una proposta automatica.

## Moduli
- **`src/lib/split-curve.ts`**
  - `densifySplitCurve`: Catmull-Rom centripeta + riproiezione di ogni campione
    sulla superficie via BVH (`closestPointToPoint`) — curva incollata alla mesh
  - `resampleUniform`: ricampionamento a passo uniforme in mm
  - `validateSplitCurve`: chiusura, ≥3 punti, distanza dai camini ≥0.8mm,
    no auto-intersezioni nella proiezione ⊥ asse di inserzione
  - `proposeSplitCurve`: piano ⊥ asse a quota mediana(fondi canale)+4mm →
    silhouette chiusa più lunga dal grafo (le geometrie STL non hanno index:
    l'intersezione lavora sui triangoli del grafo) → snap dei punti alla banda
    di alta curvatura (solco gengivale) → riproiezione BVH
  - persistenza localStorage per file
- **`src/components/viewer/split-curve-tool.tsx`**: hook con add/move/insert/
  delete/close/undo(50)/clear, densificazione e validazione memoizzate
- **`src/components/viewer/split-curve-visual.tsx`**: tubo ambra (rosso se
  invalida) + sfere controllo indigo; drag = raycast BVH continuo sulla
  superficie (il punto resta sul modello); doppio click sulla linea inserisce
  un punto; alt+click elimina; anello verde sul primo punto = chiusura

## UX (toolbar "Curva")
- Click sulla mesh → aggiunge punto · click vicino al primo punto → chiude
- ✨ Proponi (curva AI) · Chiudi loop · Undo · Clear · badge validazione live

## Task
- [x] T1 — modello dati + densificazione + validazione + serializzazione
- [x] T2 — proposta AI dalla silhouette del grafo con snap curvatura
- [x] T3 — hook editor con undo stack
- [x] T4 — visual con drag su superficie via BVH
- [x] T5 — integrazione toolbar/viewer + persistenza per file
- [x] T6 — test vitest (densify, resample, validazione, figura-8, canali, proposta)

## Test
- `npm run test` — 14 test verdi
- Manuale: disegno/chiusura/drag/undo fluidi su mesh reale (da validare con STL exocad)
