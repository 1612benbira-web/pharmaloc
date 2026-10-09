'use client';
import { useState } from 'react';
import { Badge, Button, Card, Input, Notice, Page, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { dt } from '@/lib/format';

function Restock() {
  const { data, error, reload } = useFetch<Obj[]>('/purchase-orders?limit=20');
  const meds = useFetch<Obj[]>('/medicines?limit=100');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ t: 'ok' | 'error' | 'info'; m: string } | null>(null);
  const name = (id: string) => { const m = meds.data?.find((x) => x.id === id); return m ? `${m.name} ${m.dosage ?? ''}` : 'Médicament'; };
  const generate = async () => { try { const r = await api<Obj>('/purchase-orders/generate', { method: 'POST', body: {} }); setMsg(r.data ? { t: 'ok', m: 'Suggestion mise à jour.' } : { t: 'info', m: 'Aucun réapprovisionnement nécessaire pour le moment ✅' }); reload(); } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); } };
  const accept = async (po: Obj) => {
    try {
      const items = po.items.filter((i: Obj) => qty[`${po._id}:${i.stockId}`] !== undefined).map((i: Obj) => ({ stockId: i.stockId, quantity: Number(qty[`${po._id}:${i.stockId}`]) }));
      await api(`/purchase-orders/${po._id}/accept`, { method: 'POST', body: items.length ? { items } : {} });
      setMsg({ t: 'ok', m: 'Suggestion acceptée. Rien n’est commandé automatiquement : passez commande auprès de votre fournisseur, puis enregistrez la « Nouvelle livraison ».' }); reload();
    } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); }
  };
  const reject = async (id: string) => { try { await api(`/purchase-orders/${id}/reject`, { method: 'POST', body: {} }); reload(); } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); } };
  return (
    <Page title="Réapprovisionnement" subtitle="Suggestions calculées à partir de l’historique de ventes — la décision vous appartient" actions={<Button onClick={generate}>Calculer les suggestions</Button>}>
      {(error || msg) && <div className="mb-3"><Notice tone={msg?.t ?? 'error'}>{error || msg?.m}</Notice></div>}
      <Card className="mb-4 text-sm text-ink/70"><b>Méthode :</b> consommation moyenne = unités vendues sur 14 jours ÷ 14 ; jours restants = stock ÷ consommation ; quantité suggérée = niveau cible (stock maximum, sinon 14 jours de consommation + minimum) − stock actuel, arrondie à la dizaine.</Card>
      <div className="space-y-4">
        {data?.map((po) => (
          <Card key={po._id}>
            <div className="mb-2 flex items-center justify-between"><p className="text-sm text-ink/60">Suggestion du {dt(po.createdAt)}</p><Badge tone={po.status === 'suggested' ? 'amber' : po.status === 'accepted' ? 'green' : 'gray'}>{po.status === 'suggested' ? 'À valider' : po.status === 'accepted' ? 'Acceptée' : 'Refusée'}</Badge></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-ink/50"><tr><th className="py-2">Médicament</th><th>Stock</th><th>Conso/jour</th><th>Rupture dans</th><th>Suggéré</th><th>Quantité à commander</th></tr></thead>
              <tbody>{po.items.map((i: Obj) => (
                <tr key={i.stockId} className="border-t border-brand-50" title={i.reason}><td className="py-2 font-medium">{name(i.medicineId)}</td><td>{i.currentQuantity}</td><td>{i.avgDailyConsumption}</td><td>{i.daysRemaining != null ? `~${Math.ceil(i.daysRemaining)} j` : '—'}</td><td>{i.suggestedQuantity}</td>
                  <td className="w-40">{po.status === 'suggested' ? <Input aria-label="Quantité" type="number" min="0" value={qty[`${po._id}:${i.stockId}`] ?? String(i.quantity)} onChange={(e) => setQty({ ...qty, [`${po._id}:${i.stockId}`]: e.target.value })} /> : <b>{i.quantity}</b>}</td></tr>
              ))}</tbody></table></div>
            {po.status === 'suggested' && <div className="mt-3 flex gap-2"><Button onClick={() => accept(po)}>Accepter {Object.keys(qty).some((k) => k.startsWith(po._id)) ? '(avec mes quantités)' : ''}</Button><Button variant="outline" onClick={() => reject(po._id)}>Refuser</Button></div>}
          </Card>
        ))}
        {data?.length === 0 && <Card className="text-center text-ink/60">Aucune suggestion. Cliquez sur « Calculer les suggestions ».</Card>}
      </div>
    </Page>
  );
}
export default function P() { return <RequireRole roles={['PHARMACIST']}><Restock /></RequireRole>; }
