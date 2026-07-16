# Shen3D — Fase 6: Fondamenta & Bonifica (pivot iBar)

## Obiettivo
Preparare la base per il pivot da "taglio planare" a "split barra/sovrastruttura stile iBar":
coordinate in millimetri reali, raycast accelerato BVH, dipendenze esplicite, documentazione allineata alla realtà.

## Perché
- Il viewer scalava la geometria a 80 unità: i parametri clinici (gap cemento 30–150µm, raggi camini 0.8–3mm) richiedono mm reali, e le coordinate inviate al backend devono essere nel frame originale del file STL (il taglio planare Fase 5 inviava coordinate nel frame sbagliato).
- `three-mesh-bvh` era installato ma mai usato; serve per editor curva, detection e annotazioni su mesh 100k–1M triangoli.
- `three-stdlib` era importato ma presente solo come dipendenza transitiva di drei.
- CLAUDE.md dichiarava Next.js 14 e opencascade.js/FreeCAD MCP, mai parte dell'architettura reale.

## Task
- [x] T1 — `stl-model.tsx`: rimuovere translate/scale della geometria; vertici restano in mm
- [x] T2 — `stl-viewer.tsx`: camera fit con drei `<Bounds fit clip observe>`; griglia e ombre posizionate sul bounding box reale del modello
- [x] T3 — BVH: `computeBoundsTree()` al load, `acceleratedRaycast` sul prototype, dispose al unload
- [x] T4 — `package.json`: `three-stdlib` dipendenza esplicita
- [x] T5 — Docs truth-up: CLAUDE.md (Next 16, architettura Blender headless, regole detection camini, pipeline S1–S10, parametri default)

## Test
- Caricare un STL noto: i bounds mostrati devono coincidere con `trimesh.bounds` dello stesso file (mm reali)
- Raycast (click annotazione) fluido su mesh ≥500k triangoli
- `npm run build` e `npm run lint` puliti
