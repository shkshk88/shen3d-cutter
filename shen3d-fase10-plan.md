# Shen3D — Fase 10: Pipeline Completa S4–S10 + UI Parametri/Risultato

## Obiettivo
Completare il clone della funzione iBar: dalla curva di split alla coppia
barra/sovrastruttura con gap cemento, blockout e camini preservati, con
parametri regolabili e preview 3D del risultato. Rimozione del codice legacy
del taglio planare (Fasi 2–5).

## Stage aggiunti (server/blender_ops)
- **S4** — camini anulari `cyl(r+parete) − cyl(r)` (trimesh cylinder a
  segmento), clippati all'anatomia; `through` (default) o `stop_below_occlusal`
- **S5** — barra = base ∪ camini; statistiche spessore minimo nel report (warning)
- **S6** — gap cemento: offset per-vertice lungo le normali + unione sanante;
  il fallback boolean Blender EXACT copre gli offset auto-intersecanti
- **S7** — volume ombra = sweep della barra dilatata lungo **−asse** (direzione
  di calzata: un punto della sovrastruttura collide se durante la discesa entra
  nella barra ⇒ cavità = sweep verso il basso). Raddoppio di unioni esatte,
  δ = blockout_step. In un'unica operazione: impronta con gap + blockout
  sottosquadri + clearance inserzione + fori di accesso (i camini through
  arrivano all'occlusale)
- **S8** — sovrastruttura = originale − ombra (tiene il componente maggiore)
- **S9** — ri-foratura difensiva canali su S, stop 0.2mm sopra il fondo sede
- **S10** — report: compenetrazione B∩S, gap campionato, **fit passivo
  simulato** (trasla S lungo +asse a passi e verifica zero collisioni),
  pervietà canali, conservazione volume, warning per stage
- Auto-orientazione asse: baricentro (occlusale) sopra la quota media della curva

## UI
- `params-panel.tsx` in sidebar: gap 30–150µm (def. 80), parete camino
  0.3–1.0mm, spessore min barra, modalità camino
- `result-preview.tsx` nel dialog risultato: barra indigo + sovrastruttura
  semi-trasparente, slider di esplosione lungo l'asse di inserzione, warning
  della pipeline

## Legacy rimosso
`cutting-plane.ts`, `mesh-intersection.ts` (la proposta curva usa
l'intersezione sul grafo in `split-curve.ts`), `export-cutting.ts`,
`profiles.ts`, `cutter-client.ts`, `cutting-plane-visual.tsx`,
`cut-line-visual.tsx`, `profile-preview.tsx`, `split-result-dialog.tsx`,
proxy `/api/cut` e `/api/profile`, `cutter_api.py` (v1).
Lint a zero errori dopo la bonifica.

## Test
- `python3 -m pytest server/tests/ -q` — 11 verdi, incluso e2e pipeline
  completa su protesi sintetica: watertight, no compenetrazione, fit passivo,
  canali pervi, gap nell'ordine richiesto, somma volumi < originale
- `npm run test` — 14 verdi · `npm run build` pulito · `npm run lint` zero errori

## Limiti noti (Fase 11)
- Lo scalloping dello sweep discreto (≤δ) può lasciare micro-frammenti in S
  (rimossi tenendo il componente maggiore, segnalati nei warning)
- Spessore barra: warning, nessun ispessimento automatico
- Gizmo di regolazione fine dell'asse di inserzione non ancora esposto
  (auto-orientazione + media assi canali)
