# Shen3D — Fase 12: Linea di Taglio da Profilo Barra di Supporto

## Obiettivo
Workflow exocad-style richiesto dall'utente: la linea di taglio nasce dal
profilo di una barra di supporto (altezza × larghezza sviluppate lungo
l'arcata attraverso gli impianti) e si rifinisce coi punti di controllo
spline ("pallini"), regolando altezza e larghezza.

## Due modalità di curva
- **`surface`** (anatomica, esistente): incollata alla superficie, proposta
  dalla silhouette, drag con raycast BVH sulla mesh
- **`free`** (nuova, da profilo barra): curva libera nello spazio — il muro
  del prisma di split può tagliare ATTRAVERSO il corpo della protesi: è così
  che si ottiene una barra più stretta dell'anatomia, avvolta dalla
  sovrastruttura (il classico iBar). Nessuna riproiezione; il drag dei punti
  avviene sul piano di quota ⊥ asse di inserzione

## `proposeCurveFromBarProfile` (`src/lib/split-curve.ts`)
1. Sedi implantari proiettate ⊥ asse, ordinate lungo l'arcata (sort angolare
   attorno al centroide + rotazione dopo il gap massimo = apertura del ferro
   di cavallo)
2. Centerline con estensione distale (cantilever, default 6mm)
3. **Racetrack**: offset ±larghezza/2 + cap semicircolari alle estremità
4. Quota = mediana sedi + altezza profilo; enforcement clearance camini
   (senza proiezione); ~28 punti di controllo, `mode: 'free'`

## UI (toolbar Curva)
- **✨ Anatomia** (proposta silhouette) · **▭ Barra** (proposta da profilo)
- Con ▭ Barra attivo: slider **H** (2–8mm) e **L** (3–9mm) con rigenerazione live
- **Punto selezionato**: ▲▼ altezza e ◀▶ larghezza a passi di 0.25mm
  (oltre al drag libero già esistente)
- Il `mode` viene preservato da undo/persistenza/editing

## Validazione
- Unit test racetrack (quota esatta, loop che racchiude le sedi)
- Casi reali: curva da profilo valida su entrambe le arcate
- **Pipeline end-to-end col profilo barra sull'inferiore reale**: barra
  stretta 1290mm³ avvolta da sovrastruttura 4564mm³, watertight, zero
  compenetrazione, fit passivo, 4 canali pervi — il risultato iBar classico
- 21 vitest + 11 pytest verdi, build e lint puliti

## Nota tecnica
La riproiezione sulla superficie NON si applica alle curve free: il punto
più vicino a un punto interno al solido è spesso la parete interna di un
camino — era la causa dei falsi "curva attraversa il vuoto" nelle prime prove.
