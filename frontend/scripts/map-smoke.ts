// Test de fumée de la carte (DOM simulé jsdom, hors dépendances du projet).
// Lancer :  npm i --no-save jsdom tsx && npx tsx scripts/map-smoke.ts
// Vérifie : URL des tuiles OSM, attribution, nombre de tuiles, popups sans injection HTML, interactions.
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="m"></div></body></html>', { pretendToBeVisual: true, url: 'https://pharmaloc.example/' });
const g = globalThis as any;
g.window = dom.window; g.document = dom.window.document; g.navigator = dom.window.navigator;
for (const k of ['HTMLElement', 'Element', 'Node', 'MouseEvent', 'Event', 'SVGElement', 'HTMLImageElement', 'HTMLCanvasElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DocumentFragment']) g[k] = (dom.window as any)[k];

let failed = 0;
const ok = (cond: unknown, msg: string) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failed++; };

(async () => {
  const { createMapController, TILE_URL, TILE_ATTRIBUTION } = await import('../src/lib/leafletMap');
  const L = (await import('leaflet' as string)).default;
  console.log('Politique des tuiles OSM');
  ok(TILE_URL === 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', `URL officielle exacte, HTTPS, sans sous-domaine : ${TILE_URL}`);
  ok(/openstreetmap\.org\/copyright/.test(TILE_ATTRIBUTION) && /contributors/.test(TILE_ATTRIBUTION), 'attribution « OpenStreetMap contributors » avec lien /copyright');

  const el = document.getElementById('m')!;
  Object.defineProperty(el, 'clientWidth', { value: 700 }); Object.defineProperty(el, 'clientHeight', { value: 400 });
  let picked: [number, number][] = [];
  const ctl = createMapController(el, { onPick: (a, b) => picked.push([a, b]) });
  const map = ctl.map;

  console.log('Chargement des tuiles');
  const tiles = [...el.querySelectorAll('img.leaflet-tile')] as HTMLImageElement[];
  ok(tiles.length > 0 && tiles.length <= 30, `${tiles.length} tuile(s) demandée(s) pour la zone visible (pas de pré-chargement massif)`);
  ok(tiles.every((t) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(t.src)), 'toutes les tuiles viennent de tile.openstreetmap.org (format z/x/y.png)');
  ok(map.getMaxZoom() === 19 && map.getMinZoom() === 8, `zoom borné ${map.getMinZoom()}–${map.getMaxZoom()}`);
  const attr = el.querySelector('.leaflet-control-attribution');
  ok(!!attr && /OpenStreetMap/.test(attr.textContent ?? ''), 'attribution visible dans le contrôle de la carte');
  ok(!!el.querySelector('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]'), 'lien vers openstreetmap.org/copyright présent');

  console.log('Repères, popups et sécurité');
  const evil = '<img src=x onerror="alert(1)">';
  ctl.setMarkers([
    { id: 'ph1', lat: 14.69, lng: -17.44, kind: 'pharmacy', title: 'Pharm "><script>alert(1)</script>', popup: [evil, 'Stock : 20'] },
    { id: 'dest', lat: 14.70, lng: -17.45, kind: 'destination', draggable: true },
  ]);
  ok(el.querySelectorAll('.pl-pin').length === 2, '2 repères affichés');
  let pharmMarker: any; map.eachLayer((l: any) => { if (l instanceof L.Marker && l.options.title) pharmMarker = l; });
  pharmMarker.openPopup();
  const popup = el.querySelector('.leaflet-popup-content')!;
  ok(popup.querySelectorAll('img, script').length === 0 && popup.innerHTML.includes('&lt;img'), 'popup : le HTML injecté est affiché comme TEXTE (pas d\'exécution)');
  ok(el.querySelectorAll('script').length === 0, 'aucune balise <script> injectée via le titre du repère');

  console.log('Mise à jour sans recréer les repères');
  const before = el.querySelector('.pl-pin-pharmacy');
  ctl.setMarkers([{ id: 'ph1', lat: 14.71, lng: -17.43, kind: 'pharmacy', title: 'x' }]);
  ok(el.querySelectorAll('.pl-pin').length === 1, 'un repère retiré quand il disparaît de la liste');
  ok(el.querySelector('.pl-pin-pharmacy') === before, 'le repère existant est déplacé, pas recréé');
  ctl.setLine([[14.69, -17.44], [14.71, -17.43]]);
  ok(!!el.querySelector('path.leaflet-interactive') || el.querySelectorAll('svg, canvas').length > 0, 'tracé affiché');
  ctl.setLine([]);

  console.log('Interactions (choix du point)');
  map.fire('click', { latlng: L.latLng(14.72, -17.41) });
  ok(picked.length === 1 && picked[0]![0] === 14.72 && picked[0]![1] === -17.41, 'clic sur la carte -> onPick(lat, lng)');
  ctl.setMarkers([{ id: 'dest', lat: 14.70, lng: -17.45, kind: 'destination', draggable: true }]);
  let dest: any; map.eachLayer((l: any) => { if (l instanceof L.Marker) dest = l; });
  dest.setLatLng([14.7333, -17.4222]); dest.fire('dragend');
  ok(picked.length === 2 && Math.abs(picked[1]![0] - 14.7333) < 1e-9, 'déplacement du repère -> onPick avec la nouvelle position');

  console.log('Cadrage et nettoyage');
  ctl.setMarkers([{ id: 'a', lat: 14.69, lng: -17.44, kind: 'pharmacy' }, { id: 'b', lat: 14.75, lng: -17.39, kind: 'destination' }]);
  let threw = false; try { ctl.fit(); } catch { threw = true; }
  ok(!threw && map.getZoom() >= 8 && map.getZoom() <= 16, `fit() cadre les 2 repères (zoom ${map.getZoom()})`);
  ctl.setMarkers([{ id: 'a', lat: 14.69, lng: -17.44, kind: 'pharmacy' }]); ctl.fit();
  ok(map.getZoom() === 15, 'un seul repère : zoom 15');
  ctl.setMarkers([]); ctl.fit();
  ok(true, 'fit() sans repère ne plante pas');
  ctl.destroy();
  ok(el.querySelectorAll('.leaflet-pane').length === 0, 'destroy() libère la carte');

  console.log(failed ? `\n❌ ${failed} vérification(s) en échec` : '\n✅ Toutes les vérifications passent');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
