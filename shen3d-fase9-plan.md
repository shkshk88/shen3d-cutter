# Shen3D — Fase 9: Backend v2 (FastAPI + pipeline subprocess, S1–S3)

## Obiettivo
Sostituire `cutter_api.py` (taglio planare) con l'API v2 asincrona che esegue la
pipeline split bar in un subprocess per job, con gli stage S1–S3 funzionanti
end-to-end: browser → curva → 2 STL watertight scaricabili.

## Architettura
```
server/
  app.py               FastAPI: /api/upload, /api/split-bar, /api/jobs/{id},
                       /api/download/{filename}, /api/health
  jobs.py              job store in-memory + ThreadPoolExecutor(1)
  blender_runner.py    subprocess per job (crash isolation, timeout 600s)
  blender_ops/
    split_bar.py       pipeline S1–S3 + report.json (failed_stage su errore)
    common.py          validazione STL, solido di split, boolean
  tests/
    make_synthetic_prosthesis.py   arcata sintetica con camini ground-truth
    test_pipeline.py, test_api.py
  requirements.txt
```

## Divisione motori geometrici
- **manifold3d** (via trimesh, engine="manifold"): tutti i boolean — esatto,
  veloce, deterministico (era già il fallback previsto dal piano per S7,
  promosso a motore primario dei boolean)
- **bpy/bmesh** (Blender headless, `pip install bpy`): costruzione del solido
  di split dalla curva non planare (`triangle_fill`), riparazioni mesh; in
  Fase 10 anche offset e operazioni avanzate. Fallback numpy (cap a ventaglio)
  se bpy non è installato.
- Il subprocess è lo stesso interprete Python (bpy importato nel child):
  un segfault dei kernel geometrici uccide il job, non il server.

## Stage implementati
- **S1** — import STL, merge vertici, riparazione (fill_holes), watertight
  obbligatorio, MAI voxel remesh
- **S2** — solido H: curva **gonfiata 0.05mm verso l'esterno del loop**
  (evita pareti complanari/tangenti alla superficie — causa n.1 di boolean
  fragili, verificato sul caso sintetico), estrusa lungo −asse, cap non
  planari via bmesh `triangle_fill`
- **S3** — `bar_base = originale ∩ H`, `super_raw = originale − H` (split
  esatto senza gap; il gap cemento e il blockout arrivano in Fase 10)

## API
- `POST /api/upload` → `{stl_path}` (compatibile col proxy esistente)
- `POST /api/split-bar` `{stl_path, curve[≥12], insertion_axis, channels[], params}` → `{job_id}` (422 su input invalido, stl_path confinato alla upload dir)
- `GET /api/jobs/{id}` → `{status: queued|running|done|error, stage, error, failed_stage, result: {bar, superstructure, checks}}`
- `GET /api/download/{filename}` (nome sanificato, cerca nei job)

## Frontend
- `src/lib/bar-client.ts`: `startSplitBarJob` + `pollJobUntilDone` + parametri default
- proxy `src/app/api/split-bar/route.ts` e `src/app/api/jobs/[id]/route.ts`
- bottone "⚙ Genera split" (attivo con curva chiusa e valida) con stage live
- `bar-result-dialog.tsx`: card barra/sovrastruttura con download e badge watertight

## Avvio
```
pip install -r server/requirements.txt
python -m uvicorn server.app:app --port 8001
```

## Test
- `python -m pytest server/tests/ -q` — pipeline diretta, subprocess, errori
  con failed_stage, API e2e con TestClient, validazioni, path traversal
