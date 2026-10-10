export interface Position { latitude: number; longitude: number; accuracy?: number }

/** Demande la position GPS. À n'appeler QUE suite à un clic explicite de l'utilisateur (consentement). */
export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('La géolocalisation n’est pas disponible sur cet appareil.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Position refusée.' : 'Position introuvable, réessayez.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  });
}

export const osmDirections = (from: { latitude?: number; longitude?: number } | undefined, to: { latitude?: number; longitude?: number } | undefined) =>
  from?.latitude != null && to?.latitude != null
    ? `https://www.openstreetmap.org/directions?from=${from.latitude},${from.longitude}&to=${to.latitude},${to.longitude}`
    : undefined;

export const osmPoint = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

export function ago(d?: string | Date) {
  if (!d) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  return s < 60 ? 'à l’instant' : s < 3600 ? `il y a ${Math.round(s / 60)} min` : `il y a ${Math.round(s / 3600)} h`;
}
