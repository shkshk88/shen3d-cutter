export interface DentalProfile {
  id: string
  name: string
  type: 'd_shape' | 'oval' | 'rectangular'
  description: string
  params: Record<string, number>
}

export const DENTAL_PROFILES: DentalProfile[] = [
  {
    id: 'd4',
    name: 'D4 Standard',
    type: 'd_shape',
    description: 'Profilo D-shape per impianti Ø4mm',
    params: { width: 4, height: 3, depth: 2 },
  },
  {
    id: 'd4.5',
    name: 'D4.5 Wide',
    type: 'd_shape',
    description: 'Profilo D-shape per impianti Ø4.5mm',
    params: { width: 4.5, height: 3.5, depth: 2 },
  },
  {
    id: 'd5',
    name: 'D5 Wide Body',
    type: 'd_shape',
    description: 'Profilo D-shape per impianti Ø5mm',
    params: { width: 5, height: 4, depth: 2.5 },
  },
  {
    id: 'oval-narrow',
    name: 'Ovale Stretto',
    type: 'oval',
    description: 'Profilo ovale per ponti stretti',
    params: { width: 3.5, height: 4, depth: 2 },
  },
  {
    id: 'oval-wide',
    name: 'Ovale Largo',
    type: 'oval',
    description: 'Profilo ovale per ponti larghi',
    params: { width: 5, height: 6, depth: 2.5 },
  },
  {
    id: 'rect-standard',
    name: 'Rettangolare Standard',
    type: 'rectangular',
    description: 'Profilo rettangolare con raccordi',
    params: { width: 4, height: 3, depth: 2, fillet: 0.5 },
  },
]
