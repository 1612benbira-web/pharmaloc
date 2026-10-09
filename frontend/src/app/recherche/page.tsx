'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Card, Input, Notice, Page, Select } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { fcfa } from '@/lib/format';
import { useCart } from '@/lib/cart';

function Search() {
  const params = useSearchParams();
  const router = useRouter();
  const { add } = useCart();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [f, setF] = useState({ onlyAvailable: false, delivery: false, pickup: false, openNow: false, maxDistanceKm: '', maxPrice: '', sort: '' });
  const [results, setResults] = useState<Obj[] | null>(null);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');

  const run = useCallback(async (term: string) => {
    if (term.trim().length < 2) return;
    setError('');
    const qs = new URLSearchParams({ q: term.trim() });
    if (pos) { qs.set('lat', String(pos.lat)); qs.set('lng', String(pos.lng)); } else if (neighborhood.trim()) qs.set('neighborhood', neighborhood.trim());
    for (const k of ['onlyAvailable', 'delivery', 'pickup', 'openNow'] as const) if (f[k]) qs.set(k, 'true');
    if (f.maxDistanceKm) qs.set('maxDistanceKm', f.maxDistanceKm);
    if (f.maxPrice) qs.set('maxPrice', f.maxPrice);
    if (f.sort) qs.set('sort', f.sort);
    try { setResults((await api<{ data: Obj[] }>(`/medicines/search?${qs}`)).data); } catch (e) { setError(errMsg(e)); }
  }, [pos, neighborhood, f]);

  useEffect(() => { const t = params.get('q'); if (t) run(t); }, [params, run]);

  // Géolocalisation : uniquement après un clic explicite de l'utilisateur (consentement)
  const locate = () => {
    if (!navigator.geolocation) return setGeoMsg('La géolocalisation n’est pas disponible sur cet appareil. Saisissez votre quartier.');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeoMsg('Position utilisée pour calculer les distances.'); },
      () => setGeoMsg('Position refusée : saisissez votre quartier ou votre ville.'),
      { timeout: 10000 },
    );
  };

  return (
    <Page title="Rechercher un médicament">
      <form onSubmit={(e) => { e.preventDefault(); router.push(`/recherche?q=${encodeURIComponent(q)}`); run(q); }} className="flex flex-col gap-2 sm:flex-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Quel médicament recherchez-vous ?" type="search" aria-label="Médicament"
          className="w-full flex-1 rounded-xl border border-brand-200 px-4 py-3 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
        <Button className="px-6 py-3">Rechercher</Button>
      </form>

      <Card className="mt-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            {pos ? <p className="text-sm text-brand-800">📍 Position partagée <button className="ml-2 underline" onClick={() => { setPos(null); setGeoMsg(''); }}>Ne plus l’utiliser</button></p>
              : <div className="flex flex-wrap items-end gap-2"><Button type="button" variant="outline" onClick={locate}>📍 Utiliser ma position</Button><div className="min-w-40 flex-1"><Input label="ou votre quartier" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Ex : Médina" /></div></div>}
            <p className="mt-1 text-xs text-ink/50">{geoMsg || 'Votre position n’est utilisée qu’avec votre accord, pour trier les pharmacies par distance.'}</p>
          </div>
          <Input label="Distance max (km)" type="number" min="1" value={f.maxDistanceKm} onChange={(e) => setF({ ...f, maxDistanceKm: e.target.value })} />
          <Input label="Prix max (FCFA)" type="number" min="1" value={f.maxPrice} onChange={(e) => setF({ ...f, maxPrice: e.target.value })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          {([['onlyAvailable', 'En stock'], ['delivery', 'Livraison'], ['pickup', 'Retrait'], ['openNow', 'Ouverte maintenant']] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} className="h-4 w-4 accent-brand-600" />{l}</label>
          ))}
          <div className="ml-auto w-44"><Select aria-label="Tri" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}><option value="">Tri automatique</option><option value="distance">Plus proche</option><option value="price">Moins cher</option><option value="availability">Disponibilité</option></Select></div>
        </div>
      </Card>

      {error && <div className="mt-4"><Notice>{error}</Notice></div>}
      {added && <div className="mt-4"><Notice tone="ok">{added} ajouté au panier. <a className="font-semibold underline" href="/panier">Voir le panier</a></Notice></div>}
      {results && results.length === 0 && <p className="mt-6 text-center text-ink/60">Aucun médicament trouvé pour « {q} ».</p>}

      {results?.map((r) => (
        <section key={r.medicine.id} className="mt-6">
          <h2 className="text-lg font-bold">{r.medicine.name} {r.medicine.dosage} <span className="text-sm font-normal text-ink/50">{r.medicine.form}</span> {r.medicine.prescriptionRequired && <Badge tone="amber">Ordonnance requise</Badge>}</h2>
          {r.offers.length === 0 && <p className="text-sm text-ink/60">Aucune pharmacie ne correspond à vos critères.</p>}
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {r.offers.map((o: Obj) => {
              const out = o.stock.status === 'out_of_stock';
              return (
                <Card key={o.pharmacy.id} className={out ? 'opacity-80' : ''}>
                  <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{o.pharmacy.name}</h3>
                    {out ? <Badge tone="red">Rupture de stock</Badge> : o.stock.status === 'low' ? <Badge tone="amber">Stock limité : {o.stock.available}</Badge> : <Badge tone="green">Stock : {o.stock.available}</Badge>}</div>
                  <p className="text-sm text-ink/60">{o.pharmacy.address}{o.pharmacy.neighborhood ? `, ${o.pharmacy.neighborhood}` : ''}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {o.distanceKm !== undefined && <span>📍 {o.distanceKm} km</span>}
                    <span className="font-semibold text-brand-700">{fcfa(o.stock.price)}</span>
                    <span>{o.deliveryAvailable ? '🛵 Livraison disponible' : '🛵 Livraison indisponible'}</span>
                    <span>{o.pickupAvailable ? '🏪 Retrait disponible' : '🏪 Retrait indisponible'}</span>
                    <span>{o.isOpen ? '🟢 Ouverte' : '⚪ Fermée'}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button disabled={out} onClick={() => { add({ id: o.pharmacy.id, name: o.pharmacy.name, fee: o.pharmacy.deliveryFee, delivery: o.deliveryAvailable }, { medicineId: r.medicine.id, name: `${r.medicine.name} ${r.medicine.dosage ?? ''}`.trim(), price: o.stock.price, quantity: 1, max: Math.min(50, o.stock.available), prescription: r.medicine.prescriptionRequired }); setAdded(`${r.medicine.name} (${o.pharmacy.name})`); }}>Ajouter au panier</Button>
                    {pos && <a className="rounded-lg border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/directions?from=${pos.lat},${pos.lng}&to=${o.pharmacy.latitude},${o.pharmacy.longitude}`}>Itinéraire</a>}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </Page>
  );
}
export default function Recherche() { return <Suspense fallback={<p className="p-8 text-center">Chargement…</p>}><Search /></Suspense>; }
