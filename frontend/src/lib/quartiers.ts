/**
 * Centres APPROXIMATIFS de quartiers de Dakar et sa banlieue (± 1-2 km), pour calculer une distance quand
 * le patient ne veut pas partager sa position GPS. Les adresses au Sénégal sont rarement géocodables.
 */
export const QUARTIERS: { name: string; lat: number; lng: number }[] = [
  { name: 'Plateau', lat: 14.6708, lng: -17.438 },
  { name: 'Médina', lat: 14.685, lng: -17.45 },
  { name: 'Fann', lat: 14.693, lng: -17.464 },
  { name: 'Point E', lat: 14.696, lng: -17.46 },
  { name: 'Grand Dakar', lat: 14.698, lng: -17.444 },
  { name: 'HLM', lat: 14.705, lng: -17.44 },
  { name: 'Mermoz', lat: 14.709, lng: -17.472 },
  { name: 'Sacré-Cœur', lat: 14.7125, lng: -17.4715 },
  { name: 'Liberté 6', lat: 14.7167, lng: -17.4677 },
  { name: 'Ouakam', lat: 14.72, lng: -17.49 },
  { name: 'Grand Yoff', lat: 14.728, lng: -17.451 },
  { name: 'Patte d’Oie', lat: 14.728, lng: -17.458 },
  { name: 'Almadies', lat: 14.744, lng: -17.506 },
  { name: 'Ngor', lat: 14.75, lng: -17.519 },
  { name: 'Yoff', lat: 14.75, lng: -17.47 },
  { name: 'Parcelles Assainies', lat: 14.76, lng: -17.44 },
  { name: 'Guédiawaye', lat: 14.769, lng: -17.404 },
  { name: 'Pikine', lat: 14.7549, lng: -17.3908 },
  { name: 'Thiaroye', lat: 14.76, lng: -17.35 },
  { name: 'Dalifort', lat: 14.733, lng: -17.4 },
  { name: 'Keur Massar', lat: 14.78, lng: -17.32 },
  { name: 'Rufisque', lat: 14.716, lng: -17.273 },
];
