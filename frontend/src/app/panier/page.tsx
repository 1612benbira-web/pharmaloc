'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input, Notice, Page, Select } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { fcfa, PAY_LABEL } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { RequireRole } from '@/lib/auth';

function Checkout() {
  const { cart, setQty, clear } = useCart();
  const router = useRouter();
  const [type, setType] = useState<'pickup' | 'delivery'>(cart.offersDelivery ? 'delivery' : 'pickup');
  const [pay, setPay] = useState('mobile_money');
  const [addr, setAddr] = useState({ street: '', neighborhood: '', city: 'Dakar', instructions: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!cart.lines.length) return <Page title="Mon panier"><Card className="text-center"><p>Votre panier est vide.</p><Link href="/recherche" className="mt-3 inline-block font-semibold text-brand-700 underline">Rechercher un médicament</Link></Card></Page>;
  const subtotal = cart.lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const fee = type === 'delivery' ? cart.deliveryFee : 0;
  const payments = type === 'delivery' ? ['mobile_money', 'online', 'cash_on_delivery'] : ['mobile_money', 'online', 'cash_on_pickup'];
  const method = payments.includes(pay) ? pay : payments[0]!;

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const body: Obj = { pharmacyId: cart.pharmacyId, deliveryType: type, paymentMethod: method, items: cart.lines.map((l) => ({ medicineId: l.medicineId, quantity: l.quantity })) };
      if (type === 'delivery') body.address = { street: addr.street, city: addr.city, ...(addr.neighborhood && { neighborhood: addr.neighborhood }), ...(addr.instructions && { instructions: addr.instructions }) };
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
              <button disabled={!cart.offersDelivery} onClick={() => setType('delivery')} className={`rounded-xl border p-3 text-sm font-semibold ${type === 'delivery' ? 'border-brand-600 bg-brand-50' : 'border-brand-100'} disabled:opacity-40`}>🛵 Livraison ({fcfa(cart.deliveryFee)})</button>
              <button onClick={() => setType('pickup')} className={`rounded-xl border p-3 text-sm font-semibold ${type === 'pickup' ? 'border-brand-600 bg-brand-50' : 'border-brand-100'}`}>🏪 Retrait en pharmacie</button>
            </div>
            {type === 'delivery' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><Input label="Adresse de livraison" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} placeholder="Rue, numéro, repère" required /></div>
                <Input label="Quartier" value={addr.neighborhood} onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })} />
                <Input label="Ville" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
                <div className="sm:col-span-2"><Input label="Instructions pour le livreur (optionnel)" value={addr.instructions} onChange={(e) => setAddr({ ...addr, instructions: e.target.value })} /></div>
              </div>
            )}
          </Card>
        </div>
        <Card className="h-fit space-y-3">
          <Select label="Moyen de paiement" value={method} onChange={(e) => setPay(e.target.value)}>{payments.map((p) => <option key={p} value={p}>{PAY_LABEL[p]}</option>)}</Select>
          <dl className="space-y-1 text-sm"><div className="flex justify-between"><dt>Sous-total</dt><dd>{fcfa(subtotal)}</dd></div><div className="flex justify-between"><dt>Livraison</dt><dd>{fcfa(fee)}</dd></div><div className="flex justify-between border-t border-brand-100 pt-2 text-base font-bold"><dt>Total</dt><dd>{fcfa(subtotal + fee)}</dd></div></dl>
          <Notice tone="info">Mode DEMO : aucun paiement réel n’est effectué.</Notice>
          {error && <Notice>{error}</Notice>}
          <Button className="w-full" disabled={busy || (type === 'delivery' && addr.street.trim().length < 3)} onClick={submit}>{busy ? 'Validation…' : 'Confirmer la commande'}</Button>
        </Card>
      </div>
    </Page>
  );
}
export default function Panier() { return <RequireRole roles={['PATIENT']}><Checkout /></RequireRole>; }
