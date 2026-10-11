'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input, Notice, Page, Select } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { fcfa, PAY_LABEL } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { RequireRole } from '@/lib/auth';
import { getPosition } from '@/lib/location';
import { QUARTIERS } from '@/lib/quartiers';
import { LazyMap, MapView, type MapMarker } from '@/components/MapView';

type Loc = { latitude: number; longitude: number; source: 'gps' | 'quartier' | 'manual'; label: string };

function Checkout() {
  const { cart, setQty, clear } = useCart();
  const router = useRouter();
  const [type, setType] = useState<'pickup' | 'delivery'>(cart.offersDelivery ? 'delivery' : 'pickup');
  const [pay, setPay] = useState('mobile_money');
  const [addr, setAddr] = useState({ street: '', instructions: '' });
  const [loc, setLoc] = useState<Loc | null>(null);
  const [quote, setQuote] = useState<Obj | null>(null);
  const [geoMsg, setGeoMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pharm, setPharm] = useState<Obj | null>(null);
  const [fitKey, setFitKey] = useState('init');
  const applyLoc = (l: Loc | null) => { setLoc(l); setFitKey(String(Date.now())); }; // cadrage refait seulement sur GPS/quartier, pas à chaque déplacement du repère

  useEffect(() => {
    if (cart.pharmacyId) api<{ data: Obj }>(`/pharmacies/${cart.pharmacyId}`).then((r) => setPharm(r.data)).catch(() => undefined);
  }, [cart.pharmacyId]);

  // Devis : distance pharmacie -> position du patient, frais correspondants (calcul de référence côté serveur)
  useEffect(() => {
    setQuote(null);
    if (type !== 'delivery' || !loc || !cart.pharmacyId) return;
    let alive = true;
    api<{ data: Obj }>(`/pharmacies/${cart.pharmacyId}/delivery-quote?lat=${loc.latitude}&lng=${loc.longitude}`)
      .then((r) => alive && setQuote(r.data))
      .catch((e) => alive && setError(errMsg(e)));
    return () => { alive = false; };
  }, [type, loc, cart.pharmacyId]);

  if (!cart.lines.length) return <Page title="Mon panier"><Card className="text-center"><p>Votre panier est vide.</p><Link href="/recherche" className="mt-3 inline-block font-semibold text-brand-700 underline">Rechercher un médicament</Link></Card></Page>;

  const subtotal = cart.lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const fee = type === 'delivery' ? quote?.fee ?? null : 0;
  const payments = type === 'delivery' ? ['mobile_money', 'online', 'cash_on_delivery'] : ['mobile_money', 'online', 'cash_on_pickup'];
  const method = payments.includes(pay) ? pay : payments[0]!;
  const canOrder = type === 'pickup' || (!!quote && quote.deliveryAvailable && addr.street.trim().length >= 3);

  const useGps = async () => {
    setError('');
    try { const p = await getPosition(); applyLoc({ latitude: p.latitude, longitude: p.longitude, source: 'gps', label: `Ma position (≈ ${p.accuracy} m)` }); setGeoMsg(''); }
    catch (e) { setGeoMsg((e as Error).message + ' Choisissez plutôt votre quartier.'); }
  };
  const useQuartier = (name: string) => {
    const q = QUARTIERS.find((x) => x.name === name);
    applyLoc(q ? { latitude: q.lat, longitude: q.lng, source: 'quartier', label: `Quartier ${q.name} (centre)` } : null);
  };

  const mapMarkers: MapMarker[] = [
    ...(pharm ? [{ id: 'pharmacy', lat: pharm.latitude, lng: pharm.longitude, kind: 'pharmacy' as const, title: pharm.name, popup: [pharm.name, pharm.address] }] : []),
    ...(loc ? [{ id: 'dest', lat: loc.latitude, lng: loc.longitude, kind: 'destination' as const, draggable: true, title: 'Votre point de livraison (déplacez-moi)', popup: [loc.label] }] : []),
  ];

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const body: Obj = { pharmacyId: cart.pharmacyId, deliveryType: type, paymentMethod: method, items: cart.lines.map((l) => ({ medicineId: l.medicineId, quantity: l.quantity })) };
      if (type === 'delivery' && loc) body.address = { street: addr.street, city: 'Dakar', latitude: loc.latitude, longitude: loc.longitude, locationSource: loc.source, ...(loc.source === 'quartier' && { neighborhood: loc.label.replace('Quartier ', '').replace(' (centre)', '') }), ...(addr.instructions && { instructions: addr.instructions }) };
      const r = await api<{ data: Obj }>('/orders', { method: 'POST', body });
      clear(); router.push(`/commandes/${r.data.id}`);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Page title="Mon panier" subtitle={cart.pharmacyName}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Card>
            {cart.lines.map((l) => (
              <div key={l.medicineId} className="flex items-center justify-between gap-3 border-b border-brand-50 py-3 last:border-0">
                <div><p className="font-medium">{l.name}</p><p className="text-sm text-ink/50">{fcfa(l.price)} {l.prescription && '· ordonnance à présenter'}</p></div>
                <div className="flex items-center gap-2"><Button variant="outline" aria-label="Moins" onClick={() => setQty(l.medicineId, l.quantity - 1)}>−</Button><span className="w-6 text-center">{l.quantity}</span><Button variant="outline" aria-label="Plus" onClick={() => setQty(l.medicineId, l.quantity + 1)}>+</Button>
                  <Button variant="ghost" onClick={() => setQty(l.medicineId, 0)}>Retirer</Button></div>
              </div>
            ))}
          </Card>
          <Card>
            <h2 className="font-semibold">Récupération</h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button disabled={!cart.offersDelivery} onClick={() => setType('delivery')} className={`rounded-xl border p-3 text-sm font-semibold ${type === 'delivery' ? 'border-brand-600 bg-brand-50' : 'border-brand-100'} disabled:opacity-40`}>🛵 Livraison à domicile</button>
              <button onClick={() => setType('pickup')} className={`rounded-xl border p-3 text-sm font-semibold ${type === 'pickup' ? 'border-brand-600 bg-brand-50' : 'border-brand-100'}`}>🏪 Retrait gratuit en pharmacie</button>
            </div>
            {type === 'delivery' && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-brand-50 p-3">
                  <p className="text-sm font-medium">1. Où devons-nous livrer ? <span className="text-ink/50">(les frais dépendent de la distance)</span></p>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <Button type="button" variant="outline" onClick={useGps}>📍 Utiliser ma position</Button>
                    <div className="min-w-44 flex-1"><Select label="ou choisir mon quartier" value={loc?.source === 'quartier' ? loc.label.replace('Quartier ', '').replace(' (centre)', '') : ''} onChange={(e) => useQuartier(e.target.value)}><option value="">Choisir…</option>{QUARTIERS.map((q) => <option key={q.name}>{q.name}</option>)}</Select></div>
                  </div>
                  <p className="mt-1 text-xs text-ink/50">{geoMsg || 'Votre position n’est demandée qu’après votre clic et sert uniquement à calculer la distance et à livrer.'}</p>
                  {loc && <p className="mt-1 text-sm text-brand-800">✓ {loc.label}</p>}
                </div>
                <LazyMap label="Préciser mon point sur la carte" hint="Cliquez sur la carte ou déplacez le repère rouge sur votre domicile : la distance et les frais se mettent à jour.">
                  <MapView markers={mapMarkers} fitKey={fitKey} height={320}
                    line={pharm && loc ? [[pharm.latitude, pharm.longitude], [loc.latitude, loc.longitude]] : undefined}
                    onPick={(lat, lng) => setLoc({ latitude: lat, longitude: lng, source: 'manual', label: 'Point choisi sur la carte' })} />
                </LazyMap>
                <Input label="2. Adresse précise / repère pour le livreur" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} placeholder="Rue, numéro, porte, point de repère" />
                <Input label="Instructions (optionnel)" value={addr.instructions} onChange={(e) => setAddr({ ...addr, instructions: e.target.value })} />
                {quote && (quote.deliveryAvailable
                  ? <Notice tone="ok">🛵 Distance : <b>{quote.distanceKm.toLocaleString('fr-FR')} km</b> · Frais de livraison : <b>{fcfa(quote.fee)}</b><br /><span className="text-xs">= {fcfa(quote.baseFee)}{quote.perKmFee > 0 && ` + ${fcfa(quote.perKmFee)}/km au-delà de ${quote.includedKm} km`} (distance à vol d’oiseau, arrondi aux 50 FCFA){loc?.source === 'quartier' && ' · calculé d’après le centre du quartier'}</span></Notice>
                  : <Notice>Cette pharmacie ne livre pas jusqu’à chez vous ({quote.distanceKm} km, maximum {quote.radiusKm} km). Choisissez le retrait ou une autre pharmacie.</Notice>)}
                {!loc && <p className="text-sm text-ink/60">Choisissez votre position pour voir les frais de livraison.</p>}
              </div>
            )}
          </Card>
        </div>
        <Card className="h-fit space-y-3">
          <Select label="Moyen de paiement" value={method} onChange={(e) => setPay(e.target.value)}>{payments.map((p) => <option key={p} value={p}>{PAY_LABEL[p]}</option>)}</Select>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Sous-total</dt><dd>{fcfa(subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Livraison{quote && ` (${quote.distanceKm} km)`}</dt><dd>{fee === null ? '—' : fcfa(fee)}</dd></div>
            <div className="flex justify-between border-t border-brand-100 pt-2 text-base font-bold"><dt>Total</dt><dd>{fee === null ? `${fcfa(subtotal)} + livraison` : fcfa(subtotal + fee)}</dd></div>
          </dl>
          <Notice tone="info">Mode DEMO : aucun paiement réel n’est effectué.</Notice>
          {error && <Notice>{error}</Notice>}
          <Button className="w-full" disabled={busy || !canOrder} onClick={submit}>{busy ? 'Validation…' : 'Confirmer la commande'}</Button>
        </Card>
      </div>
    </Page>
  );
}
export default function Panier() { return <RequireRole roles={['PATIENT']}><Checkout /></RequireRole>; }
