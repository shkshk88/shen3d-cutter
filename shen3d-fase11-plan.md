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

## Prossimo passo — validazione clinica (in attesa dei file dell'utente)
Con 2–3 STL reali di ibride exocad:
1. accuratezza rilevamento camini (centri <0.3mm, assi <3°)
2. proposta curva sensata sull'anatomia vera
3. pipeline completa: tempi, robustezza boolean, qualità del fit
4. taratura dei default (percentile curvatura, eps clustering, δ blockout)
