# Shen3D — Fase 11: Revisione & Iterazione

## Obiettivo
Chiudere il ciclo di revisione: regolare l'asse, rigenerare con parametri
diversi senza rifare nulla, vedere dove la barra è troppo sottile.

## Implementato
- **Asse di inserzione regolabile** (`insertion-axis-controls.tsx` in sidebar):
  flip del verso + due tilt ortogonali ±15° rispetto alla media degli assi dei
  camini (`applyAxisAdjustment` in `screw-channels.ts`); reset a un click.
  La validazione curva e il widget 3D seguono l'asse regolato; reset
  automatico al cambio file
- **Rigenerazione rapida**: upload STL cachato per file (`lastUploadRef`) —
  cambiare gap/parete/spessore e premere "↻ Rigenera" nel dialog risultato
  rilancia il job con la stessa curva senza re-upload
- **Overlay punti sottili**: `min_thickness_stats` ritorna `thin_points`
  (max 200 campioni sotto soglia) → sfere rosse toggleabili nella preview
  del risultato
- **Badge verifiche nel dialog**: no compenetrazione, fit passivo, canali
  pervi (n/N), gap mediano misurato in µm — il report S10 diventa leggibile
  a colpo d'occhio

## Rimandato (post validazione su STL reali)
- Ispessimento automatico delle zone sottili (ora warning + overlay)
- Storia dei job / confronto tra run
- Proposta curva appresa dalle annotazioni (Fase 12, serve dataset)

## Test
- Suite invariate e verdi: 14 vitest, 11 pytest (report ora include
  `bar_thickness.thin_points`), build e lint puliti

## Validazione su casi reali — COMPLETATA
Asset: `stl-samples/full-arch-bridges/` — ponti All-on-X da caso reale
(superiore 5 impianti 16-13-11-23-26, inferiore 4 impianti 36-34-44-46,
wax-up CAD per SLM, watertight, mm reali).

Harness headless: `scripts/validate-real-stl.test.ts` (detection+curva in Node,
scrive i job.json) + `server/tests/run_real_case.py` (pipeline S1–S10).

### Risultati
- **Detection camini: 5/5 e 4/4**, raggi ~1.0–1.1mm coerenti con la libreria,
  assi con i tilt reali dei posteriori inclinati, confidenze 75–100%
- **Curva proposta valida** su entrambe le arcate (l'inferiore con warning
  "rasente al canale" sul posteriore inclinato che sbuca al margine distale)
- **Pipeline: ~38s (sup) / ~51s (inf)** — parti watertight, zero
  compenetrazione, fit passivo simulato OK, tutti i canali pervi,
  gap min 58–71µm (≥ 0.7×nominale), conservazione volume OK

### Correzioni emerse dalla validazione (detection v2 + pipeline)
1. **Pairing per coassialità** (union-find), senza vincolo di similarità dei
   raggi: i canali reali hanno gradini (sede counterbore r≈2.35 + tubo r≈0.9)
2. **refineCylinder**: filtro vertici per normale ~⊥ asse (le superfici
   occlusali piatte ribaltavano la covarianza), finestra assiale espansa,
   raggio ancorato alla banda del tubo (nota dal rim) — non ristimato
3. **Gruppi singoli** ammessi per rim in range tubo (sede fusa con l'anatomia)
4. **Validazione radiale a 3 quote** con tolleranza per taper/counterbore
5. **Proposta curva**: snap alle creste ESCLUDE i rim dei camini; enforcement
   clearance con spinta radiale; validazione con distanza CON SEGNO
   (attraversare il vuoto = errore, rasente da fuori = warning)
6. **S7 heightfield**: il volume ombra è l'inviluppo superiore dello strumento
   rasterizzato su griglia ⊥ asse (passo = blockout_step) → solido terreno
   watertight con de-scacchierizzazione; sostituisce lo sweep per raddoppio
   (che esplodeva su mesh reali da 300-400k facce); conservativo per
   costruzione. La suite sintetica è passata da 180s a 11s
7. **S6**: strumento cavità semplificato con `Manifold.simplify` (errore
   limitato 0.02mm, +0.03mm di margine sul gap)
