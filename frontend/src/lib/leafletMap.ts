import L from 'leaflet';

/**
 * Module cartographique (Leaflet nu, sans wrapper React : react-leaflet est sous licence Hippocratic-2.1, non permissive).
 *
 * CONFORMITÉ À LA POLITIQUE D'USAGE DES TUILES OSM (https://operations.osmfoundation.org/policies/tiles/) :
 *  - URL exacte https://tile.openstreetmap.org/{z}/{x}/{y}.png (HTTPS, sans sous-domaines a/b/c)
 *  - attribution « © OpenStreetMap contributors » (lien vers /copyright) TOUJOURS visible sur la carte
 *  - URL de tuiles configurable (NEXT_PUBLIC_TILE_URL) pour changer de fournisseur sans modifier le code
 *  - pas de pré-chargement ni de téléchargement massif : tuiles de la zone visible uniquement, zoom borné
 *  - en-tête Referer conservé (Referrer-Policy définie dans next.config.mjs), cache HTTP du navigateur respecté
 *  - la carte n'est chargée qu'à la demande de l'utilisateur (voir LazyMap)
 */
export const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors ' +
    '· <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Signaler une erreur</a>';

export const DAKAR: [number, number] = [14.6937, -17.4441];
const MIN_ZOOM = 8;
const MAX_ZOOM = 19; // zoom maximal des serveurs de tuiles OSM

export type MarkerKind = 'pharmacy' | 'patient' | 'courier' | 'destination' | 'me';
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: MarkerKind;
  title?: string;
  /** Lignes de texte du popup : insérées en TEXTE (jamais en HTML) pour éviter toute injection. */
  popup?: string[];
  draggable?: boolean;
}

export interface MapController {
  map: L.Map;
  setMarkers(markers: MapMarker[]): void;
  setLine(points: [number, number][]): void;
  fit(): void;
  destroy(): void;
}

const EMOJI: Record<MarkerKind, string> = { pharmacy: '💊', patient: '🏠', courier: '🛵', destination: '📍', me: '🔵' };

const icon = (kind: MarkerKind) =>
  L.divIcon({ className: `pl-pin pl-pin-${kind}`, html: `<span>${EMOJI[kind]}</span>`, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16] });

function popupNode(lines: string[]): HTMLElement {
  const el = document.createElement('div');
  lines.forEach((line, i) => {
    const row = document.createElement(i === 0 ? 'strong' : 'div');
    row.textContent = line; // textContent : jamais d'HTML issu de données utilisateur
    el.appendChild(row);
  });
  return el;
}

export function createMapController(
  container: HTMLElement,
  opts: { onPick?: (lat: number, lng: number) => void; center?: [number, number]; zoom?: number } = {},
): MapController {
  const map = L.map(container, { center: opts.center ?? DAKAR, zoom: opts.zoom ?? 12, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, zoomControl: true, attributionControl: true });
  L.tileLayer(TILE_URL, { maxZoom: MAX_ZOOM, attribution: TILE_ATTRIBUTION, updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 1 }).addTo(map);
  if (opts.onPick) map.on('click', (e: L.LeafletMouseEvent) => opts.onPick!(e.latlng.lat, e.latlng.lng));

  const markers = new Map<string, L.Marker>();
  let line: L.Polyline | null = null;

  return {
    map,
    setMarkers(list) {
      const keep = new Set(list.map((m) => m.id));
      for (const [id, mk] of markers) if (!keep.has(id)) { mk.remove(); markers.delete(id); }
      for (const m of list) {
        let mk = markers.get(m.id);
        if (!mk) {
          mk = L.marker([m.lat, m.lng], { icon: icon(m.kind), title: m.title, draggable: !!m.draggable, keyboard: true }).addTo(map);
          if (m.draggable && opts.onPick) {
            const target = mk;
            mk.on('dragend', () => { const p = target.getLatLng(); opts.onPick!(p.lat, p.lng); });
          }
          markers.set(m.id, mk);
        } else {
          const cur = mk.getLatLng();
          if (cur.lat !== m.lat || cur.lng !== m.lng) mk.setLatLng([m.lat, m.lng]);
        }
        if (m.popup?.length) mk.bindPopup(popupNode(m.popup)); else mk.unbindPopup();
      }
    },
    setLine(points) {
      if (line) { line.remove(); line = null; }
      if (points.length >= 2) line = L.polyline(points, { color: '#17806a', weight: 3, dashArray: '6 8', opacity: 0.8 }).addTo(map);
    },
    fit() {
      const pts = [...markers.values()].map((m) => m.getLatLng());
      if (pts.length === 0) return;
      if (pts.length === 1) map.setView(pts[0]!, 15);
      else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
    },
    destroy() {
      markers.clear();
      map.remove();
    },
  };
}
