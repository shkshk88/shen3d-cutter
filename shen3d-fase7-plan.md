# Shen3D — Fase 7: Rilevamento Camini Vite

## Obiettivo
Sostituire il RANSAC cilindri (asse casuale, altezza sempre 0) con un rilevamento
robusto dei camini vite dalla mesh monolitica: i camini sono tubi cavi interni,
delimitati da coppie di bordi circolari netti (rim occlusale + rim intaglio).

## Algoritmo (`src/lib/screw-channels.ts`)
1. **Grafo mesh** (`src/lib/mesh-graph.ts`): vertici unici + adiacenza + normali
   pesate per area — necessario perché STLLoader produce geometrie non indicizzate
   (fix: la curvatura ritornava zeri su STL)
2. **Rim detection**: vertici ad alta curvatura (percentile 88) → clustering DBSCAN
   su griglia (eps 0.8mm) → fit cerchio per cluster (PCA piano + Kåsa) con filtri su
   raggio (0.8–3.5mm), residuo (<0.2mm), planarità e copertura angolare (≥7/12 bin)
3. **Pairing**: rim allineati (|dot| > 0.7) a distanza 3–30mm con raggi simili → canale
4. **Raffinamento**: vertici della parete del tubo → asse = autovettore minimo della
   covarianza delle normali; raggio/centro/quota ricalcolati; 2 iterazioni
5. **Validazione**: raggi radiali ⊥ asse via BVH — la parete interna deve stare a
   distanza ≈ raggio (≥50% dei raggi coerenti)
6. **Orientazione coerente** degli assi + asse di inserzione = media

## UI
- `implant-marker.tsx`: cilindro fantasma con raggio/altezza reali, label "Canale"
- `insertion-axis-widget.tsx`: freccia indigo dell'asse di inserzione
- Sidebar: lista camini con rimozione (✕), badge (manuale)
- Toolbar "+ Canale": click dentro un camino non rilevato → fit locale seedato
  (`fitChannelFromSeed`)

## Task
- [x] T1 — `mesh-graph.ts`: grafo vertici unici
- [x] T2 — `curvature.ts` graph-based (fix STL non indicizzati)
- [x] T3 — `screw-channels.ts`: pipeline completa + utility numeriche (Jacobi, Kåsa, DBSCAN)
- [x] T4 — `mesh-analysis.ts`: `channels` + `insertionAxis` + `graph` nel risultato
- [x] T5 — consumer aggiornati (sidebar, viewer-section, stl-viewer, cutting-plane, marker)
- [x] T6 — add/remove manuale canali + widget asse
- [x] T7 — unit test vitest (eigen, cerchio, clustering, tubo sintetico end-to-end)

## Test
- `npm run test` — 6 test verdi, incluso tubo sintetico (raggio ±0.3mm, asse ±2°, altezza ±20%)
- Da validare su ≥2 ibride exocad reali: centri entro 0.3mm, assi entro 3° (serve STL reale)
