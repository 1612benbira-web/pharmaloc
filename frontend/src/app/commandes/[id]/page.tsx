'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Button, Card, Notice, Page, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { dt, fcfa, PAY_LABEL, STATUS_LABEL } from '@/lib/format';
import { statusTone } from '../page';

function Tracking() {
  const { id } = useParams<{ id: string }>();
  const { data: o, error, reload } = useFetch<Obj>(`/orders/${id}`, 6000);
  const [msg, setMsg] = useState('');
  const [rating, setRating] = useState(5);
  if (error && !o) return <Page title="Commande"><Notice>{error}</Notice></Page>;
  if (!o) return <Page title="Commande"><p>Chargement…</p></Page>;
  const flow = o.deliveryType === 'delivery' ? ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'in_delivery', 'delivered'] : ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];
  const at = flow.indexOf(o.status);
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
          {o.delivery?.agentLatitude && o.status === 'in_delivery' && <p className="mt-3 text-sm text-ink/60">🛵 Position du livreur : {o.delivery.agentLatitude.toFixed(4)}, {o.delivery.agentLongitude.toFixed(4)} (mise à jour {dt(o.delivery.agentLocationAt)}) · <a className="underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${o.delivery.agentLatitude}&mlon=${o.delivery.agentLongitude}#map=16/${o.delivery.agentLatitude}/${o.delivery.agentLongitude}`}>voir sur la carte</a></p>}
          <div className="mt-4 border-t border-brand-50 pt-3 text-sm">{o.items.map((i: Obj) => <p key={i.stockId + i.name} className="flex justify-between"><span>{i.quantity}× {i.name}</span><span>{fcfa(i.quantity * i.unitPrice)}</span></p>)}
            <p className="mt-2 flex justify-between text-ink/60"><span>Livraison</span><span>{fcfa(o.deliveryFee)}</span></p><p className="flex justify-between font-bold"><span>Total</span><span>{fcfa(o.totalAmount)}</span></p></div>
        </Card>
        <div className="space-y-4">
          {o.deliveryCode && <Card className="text-center"><p className="text-xs uppercase tracking-wide text-ink/50">{o.deliveryType === 'delivery' ? 'Code de livraison' : 'Code de retrait'}</p><p className="my-2 font-mono text-4xl font-extrabold tracking-widest text-brand-700">{o.deliveryCode}</p><p className="text-xs text-ink/60">À communiquer uniquement à la réception de votre commande.</p></Card>}
          <Card className="text-sm"><p><b>Paiement :</b> {PAY_LABEL[o.paymentMethod]} · {o.paymentStatus === 'paid' ? 'payé' : o.paymentStatus === 'refunded' ? 'remboursé' : 'à régler'}</p>
            {o.payments?.[0]?.mode === 'DEMO' && <p className="mt-1 text-xs text-amber-700">Mode DEMO : aucun argent réel.</p>}
            {o.prescriptionRequired && <p className="mt-2 text-amber-700">⚠ Une ordonnance sera demandée par la pharmacie.</p>}
            {o.pharmacy && <p className="mt-2 text-ink/60">{o.pharmacy.address}{o.pharmacy.phone && ` · ${o.pharmacy.phone}`}</p>}</Card>
          {['pending', 'confirmed'].includes(o.status) && <Button variant="danger" className="w-full" onClick={cancel}>Annuler la commande</Button>}
          {o.status === 'delivered' && <Card><p className="mb-2 text-sm font-semibold">Évaluer le service</p><div className="flex items-center gap-2"><select value={rating} onChange={(e) => setRating(+e.target.value)} className="rounded-lg border border-brand-200 px-2 py-1">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</select><Button onClick={review}>Envoyer</Button></div></Card>}
        </div>
      </div>
    </Page>
  );
}
export default function Order() { return <RequireRole roles={['PATIENT']}><Tracking /></RequireRole>; }
