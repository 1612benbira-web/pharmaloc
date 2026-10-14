'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Input, Notice, Page, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { fcfa, PAY_LABEL, STATUS_LABEL, telHref, waHref } from '@/lib/format';
import { ago, osmDirections, osmPoint } from '@/lib/location';
import { LazyMap, MapView, type MapMarker } from '@/components/MapView';

const route = (a?: Obj, b?: Obj) => a?.latitude && b?.latitude ? `https://www.openstreetmap.org/directions?from=${a.latitude},${a.longitude}&to=${b.latitude},${b.longitude}` : undefined;

const deliveryMarkers = (d: Obj): MapMarker[] => [
  ...(d.pickupLocation?.latitude != null ? [{ id: 'pickup', lat: d.pickupLocation.latitude, lng: d.pickupLocation.longitude, kind: 'pharmacy' as const, title: 'Pharmacie', popup: ['Pharmacie (retrait)', d.pickupLocation.address ?? ''] }] : []),
  ...(d.deliveryLocation?.latitude != null ? [{ id: 'dest', lat: d.deliveryLocation.latitude, lng: d.deliveryLocation.longitude, kind: 'destination' as const, title: 'Adresse du client', popup: ['Adresse de livraison', d.deliveryLocation.address ?? ''] }] : []),
  ...(d.patientLatitude != null ? [{ id: 'patient', lat: d.patientLatitude, lng: d.patientLongitude, kind: 'patient' as const, title: 'Position partagée par le client', popup: ['Position partagée par le client', ago(d.patientLocationAt)] }] : []),
  ...(d.agentLatitude != null ? [{ id: 'me', lat: d.agentLatitude, lng: d.agentLongitude, kind: 'courier' as const, title: 'Ma position', popup: ['Ma position'] }] : []),
];

function Agent() {
  const me = useFetch<Obj>('/agents/me', 15000);
  const avail = useFetch<Obj[]>('/deliveries/available', 6000);
  const mine = useFetch<Obj[]>('/deliveries/mine', 6000);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null);
  const [cash, setCash] = useState<Obj | null>(null);
  const loadCash = useCallback(async () => {
    try { const r = await api<{ meta: Obj }>('/settlements?limit=1'); setCash(r.meta.summary ?? null); } catch { /* bandeau facultatif */ }
  }, []);
  useEffect(() => { loadCash(); const t = setInterval(loadCash, 20000); return () => clearInterval(t); }, [loadCash]);
  const reloadAll = () => { me.reload(); avail.reload(); mine.reload(); loadCash(); };
  const call = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); setMsg(ok ? { t: 'ok', m: ok } : null); reloadAll(); } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); } };
  const toggle = () => call(() => api('/agents/me', { method: 'PATCH', body: { isAvailable: !me.data?.isAvailable } }));
  const share = (id: string) => navigator.geolocation?.getCurrentPosition(
    (p) => call(() => api(`/deliveries/${id}/location`, { method: 'POST', body: { latitude: p.coords.latitude, longitude: p.coords.longitude } }), 'Position partagée avec le client.'),
    () => setMsg({ t: 'error', m: 'Position refusée.' }),
  );
  const active = mine.data?.filter((d) => ['assigned', 'picked_up', 'in_delivery'].includes(d.status));
  const done = mine.data?.filter((d) => d.status === 'delivered');

  return (
    <Page title="Mes livraisons" actions={<Button variant={me.data?.isAvailable ? 'danger' : 'primary'} onClick={toggle}>{me.data?.isAvailable ? '⏸ Passer indisponible' : '▶ Passer disponible'}</Button>}>
      <div className="mb-3 flex items-center gap-2 text-sm">Statut : {me.data?.isAvailable ? <Badge tone="green">Disponible</Badge> : <Badge tone="gray">Indisponible</Badge>}</div>
      {msg && <div className="mb-3"><Notice tone={msg.t}>{msg.m}</Notice></div>}

      {cash && cash.cashToRemit > 0 && (
        <div className="mb-4"><Notice tone={cash.cashToRemit > cash.cashLimit ? 'error' : 'info'}>💰 Espèces à remettre aux pharmacies : <b>{fcfa(cash.cashToRemit)}</b> (plafond {fcfa(cash.cashLimit)}){cash.cashToRemit > cash.cashLimit && ' : vous ne pouvez plus accepter de livraison avant de les remettre'}. <Link className="underline" href="/livreur/gains">Voir mes gains</Link></Notice></div>
      )}
      <h2 className="mb-2 font-semibold">En cours ({active?.length ?? 0})</h2>
      <div className="space-y-3">
        {active?.map((d) => (
          <Card key={d._id}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{d.order?.items?.map((i: Obj) => `${i.quantity}× ${i.name}`).join(', ')}</p>
              <p className="text-sm text-ink/60">🏪 Pharmacie : {d.pickupLocation?.address}</p><p className="text-sm text-ink/60">📍 Client : {d.deliveryLocation?.address || d.order?.addressSnapshot?.street}</p>
              {d.order?.deliveryDistanceKm != null && <p className="text-sm text-ink/60">🛵 {d.order.deliveryDistanceKm} km · frais de livraison {fcfa(d.order.deliveryFee ?? 0)}</p>}
              {d.patientLatitude != null && (
                <p className="mt-1 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">📍 <b>Position partagée par le client</b> ({ago(d.patientLocationAt)}) · <a className="underline" target="_blank" rel="noreferrer" href={osmPoint(d.patientLatitude, d.patientLongitude)}>voir sur la carte</a>
                  {' · '}<a className="font-semibold underline" target="_blank" rel="noreferrer" href={osmDirections(d.agentLatitude != null ? { latitude: d.agentLatitude, longitude: d.agentLongitude } : d.pickupLocation, { latitude: d.patientLatitude, longitude: d.patientLongitude })}>itinéraire vers le client</a></p>
              )}
              {d.patientPhone ? (
                <p className="mt-1 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">📞 <b>Numéro du client :</b> <a className="font-semibold underline" href={telHref(d.patientPhone)}>{d.patientPhone}</a>
                  {' · '}<a className="underline" target="_blank" rel="noreferrer" href={waHref(d.patientPhone)}>WhatsApp</a></p>
              ) : d.phoneRequestStatus === 'requested' ? (
                <p className="mt-1 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">⏳ Demande de numéro envoyée au client : en attente de sa réponse.</p>
              ) : d.phoneRequestStatus === 'declined' ? (
                <p className="mt-1 rounded-lg bg-gray-100 p-2 text-sm text-ink/70">🚫 Le client préfère ne pas partager son numéro. Utilisez sa position partagée ou contactez la pharmacie.</p>
              ) : null}
              <p className="text-sm text-ink/60">{fcfa(d.order?.totalAmount ?? 0)} · {PAY_LABEL[d.order?.paymentMethod]} {d.order?.paymentMethod === 'cash_on_delivery' && <b className="text-amber-700">· à encaisser</b>}</p></div><Badge tone="blue">{STATUS_LABEL[d.status]}</Badge></div>
            {deliveryMarkers(d).length > 0 && <div className="mt-3"><LazyMap label="Voir la carte" hint="🏪 pharmacie · 📍 adresse du client · 🏠 position partagée par le client · 🛵 ma position"><MapView markers={deliveryMarkers(d)} fitKey={`${d._id}:${d.status}:${d.patientLocationAt ?? ''}`} height={300} /></LazyMap></div>}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {route(d.pickupLocation, d.deliveryLocation) && <a className="rounded-lg border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50" target="_blank" rel="noreferrer" href={route(d.pickupLocation, d.deliveryLocation)}>Itinéraire</a>}
              {!d.patientPhone && d.phoneRequestStatus !== 'requested' && (d.phoneRequestCount ?? 0) < 3 && <Button variant="outline" onClick={() => call(() => api(`/deliveries/${d._id}/request-phone`, { method: 'POST' }), 'Demande envoyée au client.')}>📞 {d.phoneRequestStatus === 'declined' ? 'Redemander' : 'Demander'} le numéro du client</Button>}
              {d.status === 'assigned' && <Button onClick={() => call(() => api(`/deliveries/${d._id}/pickup`, { method: 'POST' }), 'Commande récupérée.')}>J’ai récupéré la commande</Button>}
              {d.status === 'picked_up' && <Button onClick={() => call(() => api(`/deliveries/${d._id}/start`, { method: 'POST' }), 'Livraison démarrée.')}>Démarrer la livraison</Button>}
              {d.status === 'in_delivery' && <><Button variant="outline" onClick={() => share(d._id)}>📍 Partager ma position</Button>
                <div className="w-40"><Input label="Code du client" inputMode="numeric" maxLength={6} value={codes[d._id] ?? ''} onChange={(e) => setCodes({ ...codes, [d._id]: e.target.value })} /></div>
                <Button disabled={(codes[d._id] ?? '').length !== 6} onClick={() => call(() => api(`/deliveries/${d._id}/complete`, { method: 'POST', body: { code: codes[d._id] } }), 'Livraison confirmée ✅')}>Confirmer la livraison</Button></>}
            </div>
          </Card>
        ))}
        {active?.length === 0 && <Card className="text-center text-ink/60">Aucune livraison en cours.</Card>}
      </div>

      <h2 className="mb-2 mt-6 font-semibold">Demandes disponibles ({avail.data?.length ?? 0})</h2>
      {!me.data?.isAvailable && <Notice tone="info">Passez « disponible » pour voir et accepter les demandes.</Notice>}
      <div className="mt-2 space-y-3">
        {avail.data?.map((d) => (
          <Card key={d._id} className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{d.pharmacy?.name}</p><p className="text-sm text-ink/60">🏪 {d.pharmacy?.address} → 📍 {d.deliveryLocation?.address || 'adresse du client'}</p><p className="text-sm text-ink/60">{d.order?.items?.length} article(s) · frais {fcfa(d.order?.deliveryFee ?? 0)}</p></div>
            <Button onClick={() => call(() => api('/delivery-assignments', { method: 'POST', body: { deliveryId: d._id } }), 'Livraison acceptée.')}>Accepter</Button></Card>
        ))}
      </div>
      {!!done?.length && <p className="mt-6 text-sm text-ink/60">✅ {done.length} livraison(s) terminée(s).</p>}
    </Page>
  );
}
export default function P() { return <RequireRole roles={['DELIVERY_AGENT']}><Agent /></RequireRole>; }
