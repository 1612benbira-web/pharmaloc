'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Button, Card, Input, Notice, Page, useFetch } from '@/components/ui';
import { api, ApiError, errMsg, type Obj } from '@/lib/api';
import { ago, getPosition } from '@/lib/location';
import { useAuth } from '@/lib/auth';
import { RequireRole } from '@/lib/auth';
import { dt, fcfa, PAY_LABEL, STATUS_LABEL } from '@/lib/format';
import { statusTone } from '../page';
import { LazyMap, MapView, type MapMarker } from '@/components/MapView';

/** Le patient envoie VOLONTAIREMENT sa position au livreur assigné (consentement à chaque envoi). */
function ShareLocation({ orderId, sharedAt, onChange }: { orderId: string; sharedAt?: string; onChange: () => void }) {
  const [auto, setAuto] = useState(false);
  const [msg, setMsg] = useState('');
  const send = useCallback(async () => {
    try {
      const p = await getPosition();
      await api(`/orders/${orderId}/share-location`, { method: 'POST', body: { latitude: p.latitude, longitude: p.longitude, ...(p.accuracy !== undefined && { accuracy: p.accuracy }) } });
      setMsg(''); onChange();
    } catch (e) { setMsg(e instanceof ApiError ? errMsg(e) : (e as Error).message); setAuto(false); }
  }, [orderId, onChange]);
  useEffect(() => { if (!auto) return; const t = setInterval(send, 30000); return () => clearInterval(t); }, [auto, send]);
  const stop = async () => { setAuto(false); try { await api(`/orders/${orderId}/share-location`, { method: 'DELETE' }); onChange(); } catch (e) { setMsg(errMsg(e)); } };
  return (
    <Card className="space-y-2 text-sm">
      <p className="font-semibold">📍 Aider le livreur à vous trouver</p>
      <p className="text-xs text-ink/60">En cliquant, votre position actuelle est envoyée <b>uniquement au livreur de cette commande</b>. Elle est effacée à la fin de la livraison, et vous pouvez arrêter à tout moment.</p>
      {sharedAt && <p className="text-emerald-700">✓ Position envoyée {ago(sharedAt)}</p>}
      <div className="flex flex-wrap gap-2"><Button onClick={send}>{sharedAt ? 'Mettre à jour ma position' : 'Envoyer ma position au livreur'}</Button>{sharedAt && <Button variant="outline" onClick={stop}>Arrêter le partage</Button>}</div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-brand-600" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (e.target.checked) send(); }} />Mettre à jour automatiquement toutes les 30 s (garder cette page ouverte)</label>
      {msg && <Notice>{msg}</Notice>}
    </Card>
  );
}

/** Le patient décide d'envoyer son numéro au livreur, ou répond à sa demande (accepter / refuser). */
function PhoneSharing({ orderId, delivery, onChange }: { orderId: string; delivery?: Obj; onChange: () => void }) {
  const { user } = useAuth();
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [msg, setMsg] = useState('');
  const status = delivery?.phoneRequestStatus as string | undefined;
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); setMsg(''); onChange(); } catch (e) { setMsg(errMsg(e)); } };
  const share = () => run(() => api(`/orders/${orderId}/share-phone`, { method: 'POST', body: phone.trim() ? { phone: phone.trim() } : {} }));
  return (
    <Card className={`space-y-2 text-sm ${status === 'requested' ? 'border-amber-400 bg-amber-50' : ''}`}>
      <p className="font-semibold">📞 Votre numéro pour le livreur</p>
      {status === 'requested' && <p className="font-medium text-amber-900">Le livreur demande votre numéro pour vous joindre à l’arrivée.</p>}
      {status === 'shared' && delivery?.patientPhone ? (
        <>
          <p className="text-emerald-700">✓ Numéro partagé : <b>{delivery.patientPhone}</b></p>
          <Button variant="outline" onClick={() => run(() => api(`/orders/${orderId}/share-phone`, { method: 'DELETE' }))}>Arrêter le partage</Button>
        </>
      ) : (
        <>
          <p className="text-xs text-ink/60">Votre numéro est envoyé <b>uniquement au livreur de cette commande</b>, uniquement si vous le décidez, et il est effacé à la fin de la livraison. La pharmacie ne le voit pas.</p>
          <Input label="Numéro de téléphone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221 77 123 45 67" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={share} disabled={!phone.trim() && !user?.phone}>{status === 'requested' ? 'Accepter et partager' : 'Envoyer mon numéro au livreur'}</Button>
            {status === 'requested' && <Button variant="outline" onClick={() => run(() => api(`/orders/${orderId}/decline-phone-request`, { method: 'POST' }))}>Refuser</Button>}
          </div>
          {status === 'declined' && <p className="text-xs text-ink/50">Vous avez refusé la dernière demande ; vous pouvez toujours partager votre numéro.</p>}
        </>
      )}
      {msg && <Notice>{msg}</Notice>}
    </Card>
  );
}

function Tracking() {
  const { id } = useParams<{ id: string }>();
  const { data: o, error, reload } = useFetch<Obj>(`/orders/${id}`, 6000);
  const [msg, setMsg] = useState('');
  const [rating, setRating] = useState(5);
  if (error && !o) return <Page title="Commande"><Notice>{error}</Notice></Page>;
  if (!o) return <Page title="Commande"><p>Chargement…</p></Page>;
  const flow = o.deliveryType === 'delivery' ? ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'in_delivery', 'delivered'] : ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];
  const at = flow.indexOf(o.status);
  const snap = o.addressSnapshot ?? {};
  const mapMarkers: MapMarker[] = [
    ...(o.pharmacy?.latitude != null ? [{ id: 'pharmacy', lat: o.pharmacy.latitude, lng: o.pharmacy.longitude, kind: 'pharmacy' as const, title: o.pharmacy.name, popup: [o.pharmacy.name, o.pharmacy.address] }] : []),
    ...(snap.latitude != null ? [{ id: 'dest', lat: snap.latitude, lng: snap.longitude, kind: 'destination' as const, title: 'Adresse de livraison', popup: ['Adresse de livraison', snap.street ?? ''] }] : []),
    ...(o.delivery?.agentLatitude != null ? [{ id: 'courier', lat: o.delivery.agentLatitude, lng: o.delivery.agentLongitude, kind: 'courier' as const, title: 'Livreur', popup: ['Votre livreur', `Mis à jour ${dt(o.delivery.agentLocationAt)}`] }] : []),
    ...(o.delivery?.patientLatitude != null ? [{ id: 'me', lat: o.delivery.patientLatitude, lng: o.delivery.patientLongitude, kind: 'patient' as const, title: 'Ma position partagée', popup: ['Ma position partagée avec le livreur'] }] : []),
  ];
  const cancel = async () => { try { await api(`/orders/${id}/cancel`, { method: 'POST', body: { reason: 'Annulée par le patient' } }); reload(); } catch (e) { setMsg(errMsg(e)); } };
  const review = async () => { try { await api(`/orders/${id}/review`, { method: 'POST', body: { rating } }); setMsg('Merci pour votre évaluation !'); } catch (e) { setMsg(errMsg(e)); } };

  return (
    <Page title={`Commande ${o.pharmacy?.name ?? ''}`} subtitle={`Passée le ${dt(o.createdAt)}`} actions={<Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge>}>
      {msg && <div className="mb-3"><Notice tone="info">{msg}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="font-semibold">Suivi</h2>
          {o.status === 'cancelled' ? <p className="mt-2 text-red-700">Commande annulée{o.cancelReason ? ` : ${o.cancelReason}` : ''}. {o.paymentStatus === 'refunded' && 'Paiement remboursé.'}</p> : (
            <ol className="mt-3 space-y-2">
              {flow.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-sm"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i <= at ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{i < at ? '✓' : i + 1}</span>
                  <span className={i === at ? 'font-bold' : i < at ? '' : 'text-ink/40'}>{STATUS_LABEL[s]}</span></li>
              ))}
            </ol>
          )}
          {o.deliveryType === 'delivery' && o.status !== 'cancelled' && mapMarkers.length > 0 && (
            <div className="mt-4"><LazyMap label="Voir la carte du trajet" hint="🏪 pharmacie · 📍 adresse de livraison · 🛵 livreur (position partagée par lui) · 🏠 ma position partagée"><MapView markers={mapMarkers} fitKey={`${o.status}:${mapMarkers.length}`} height={300} /></LazyMap></div>
          )}
          {o.delivery?.agentLatitude && o.status === 'in_delivery' && <p className="mt-3 text-sm text-ink/60">🛵 Position du livreur : {o.delivery.agentLatitude.toFixed(4)}, {o.delivery.agentLongitude.toFixed(4)} (mise à jour {dt(o.delivery.agentLocationAt)}) · <a className="underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${o.delivery.agentLatitude}&mlon=${o.delivery.agentLongitude}#map=16/${o.delivery.agentLatitude}/${o.delivery.agentLongitude}`}>voir sur la carte</a></p>}
          <div className="mt-4 border-t border-brand-50 pt-3 text-sm">{o.items.map((i: Obj) => <p key={i.stockId + i.name} className="flex justify-between"><span>{i.quantity}× {i.name}</span><span>{fcfa(i.quantity * i.unitPrice)}</span></p>)}
            <p className="mt-2 flex justify-between text-ink/60"><span>Livraison{o.deliveryDistanceKm != null && ` (${o.deliveryDistanceKm} km)`}</span><span>{fcfa(o.deliveryFee)}</span></p><p className="flex justify-between font-bold"><span>Total</span><span>{fcfa(o.totalAmount)}</span></p></div>
        </Card>
        <div className="space-y-4">
          {o.deliveryCode && <Card className="text-center"><p className="text-xs uppercase tracking-wide text-ink/50">{o.deliveryType === 'delivery' ? 'Code de livraison' : 'Code de retrait'}</p><p className="my-2 font-mono text-4xl font-extrabold tracking-widest text-brand-700">{o.deliveryCode}</p><p className="text-xs text-ink/60">À communiquer uniquement à la réception de votre commande.</p></Card>}
          <Card className="text-sm"><p><b>Paiement :</b> {PAY_LABEL[o.paymentMethod]} · {o.paymentStatus === 'paid' ? 'payé' : o.paymentStatus === 'refunded' ? 'remboursé' : 'à régler'}</p>
            {o.payments?.[0]?.mode === 'DEMO' && <p className="mt-1 text-xs text-amber-700">Mode DEMO : aucun argent réel.</p>}
            {o.prescriptionRequired && <p className="mt-2 text-amber-700">⚠ Une ordonnance sera demandée par la pharmacie.</p>}
            {o.pharmacy && <p className="mt-2 text-ink/60">{o.pharmacy.address}{o.pharmacy.phone && ` · ${o.pharmacy.phone}`}</p>}</Card>
          {o.deliveryType === 'delivery' && ['assigned', 'picked_up', 'in_delivery'].includes(o.status) && <PhoneSharing orderId={id} delivery={o.delivery} onChange={reload} />}
          {o.deliveryType === 'delivery' && ['assigned', 'picked_up', 'in_delivery'].includes(o.status) && <ShareLocation orderId={id} sharedAt={o.delivery?.patientLocationAt} onChange={reload} />}
          {['pending', 'confirmed'].includes(o.status) && <Button variant="danger" className="w-full" onClick={cancel}>Annuler la commande</Button>}
          {o.status === 'delivered' && <Card><p className="mb-2 text-sm font-semibold">Évaluer le service</p><div className="flex items-center gap-2"><select value={rating} onChange={(e) => setRating(+e.target.value)} className="rounded-lg border border-brand-200 px-2 py-1">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</select><Button onClick={review}>Envoyer</Button></div></Card>}
        </div>
      </div>
    </Page>
  );
}
export default function Order() { return <RequireRole roles={['PATIENT']}><Tracking /></RequireRole>; }
