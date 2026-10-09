'use client';
import { useState } from 'react';
import { Badge, Button, Card, Input, Notice, Page, Select, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { dt, fcfa } from '@/lib/format';

const blank = { medicineId: '', quantity: '', batchNumber: '', expirationDate: '', purchasePrice: '' };

function NewDelivery() {
  const meds = useFetch<Obj[]>('/medicines?limit=100');
  const history = useFetch<Obj[]>('/supplier-deliveries?limit=10');
  const suppliers = useFetch<Obj[]>('/suppliers');
  const [head, setHead] = useState({ supplierName: '', reference: '', receivedAt: new Date().toISOString().slice(0, 10) });
  const [items, setItems] = useState([{ ...blank }]);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Obj | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setItem = (i: number, k: keyof typeof blank, v: string) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const medName = (id: string) => { const m = meds.data?.find((x) => x.id === id); return m ? `${m.name} ${m.dosage ?? ''}` : id; };

  // Saisie / scan de code-barres (douchette ou saisie manuelle) : identifie le médicament
  const lookup = async () => {
    try {
      const r = await api<{ data: Obj[] }>(`/medicines/search?q=${encodeURIComponent(code.trim())}`);
      const m = r.data[0]?.medicine;
      if (!m) return setError('Aucun médicament trouvé pour ce code.');
      const idx = items.findIndex((it) => !it.medicineId);
      const target = idx === -1 ? items.length : idx;
      setItems(idx === -1 ? [...items, { ...blank, medicineId: m.id }] : items.map((it, j) => (j === target ? { ...it, medicineId: m.id } : it)));
      setError(''); setCode('');
    } catch (e) { setError(errMsg(e)); }
  };

  const submit = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const body = { ...head, items: items.map((i) => ({ medicineId: i.medicineId, quantity: Number(i.quantity), batchNumber: i.batchNumber, expirationDate: i.expirationDate, ...(i.purchasePrice && { purchasePrice: Number(i.purchasePrice) }) })) };
      const r = await api<{ data: Obj }>('/supplier-deliveries', { method: 'POST', body });
      setResult({ ...r.data, itemsSent: items }); setItems([{ ...blank }]); setHead({ ...head, reference: '' }); history.reload();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const valid = head.supplierName.length >= 2 && head.reference.length >= 2 && items.every((i) => i.medicineId && Number(i.quantity) > 0 && i.batchNumber && i.expirationDate);

  return (
    <Page title="Nouvelle livraison fournisseur" subtitle="Après validation : stock mis à jour, mouvements créés, alertes recalculées, audit enregistré.">
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Input label="Fournisseur" list="sup" value={head.supplierName} onChange={(e) => setHead({ ...head, supplierName: e.target.value })} placeholder="Sanofi" /><datalist id="sup">{suppliers.data?.map((s) => <option key={s._id} value={s.name} />)}</datalist></div>
          <Input label="Référence de livraison" value={head.reference} onChange={(e) => setHead({ ...head, reference: e.target.value })} placeholder="LIV-2026-001" />
          <Input label="Date de livraison" type="date" value={head.receivedAt} onChange={(e) => setHead({ ...head, receivedAt: e.target.value })} />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-brand-50 p-3"><div className="min-w-56 flex-1"><Input label="Code-barres (scanner ou saisie manuelle)" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }} placeholder="Ex : 6150000000001" /></div><Button type="button" variant="outline" disabled={code.length < 4} onClick={lookup}>Identifier</Button></div>
        <div className="mt-4 space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-brand-100 p-3 sm:grid-cols-6">
              <div className="sm:col-span-2"><Select label="Médicament" value={it.medicineId} onChange={(e) => setItem(i, 'medicineId', e.target.value)}><option value="">Choisir…</option>{meds.data?.map((m) => <option key={m.id} value={m.id}>{m.name} {m.dosage}</option>)}</Select></div>
              <Input label="Quantité" type="number" min="1" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
              <Input label="Lot" value={it.batchNumber} onChange={(e) => setItem(i, 'batchNumber', e.target.value)} placeholder="LOT123" />
              <Input label="Expiration" type="month" value={it.expirationDate} onChange={(e) => setItem(i, 'expirationDate', e.target.value)} />
              <Input label="Prix d’achat" type="number" min="0" value={it.purchasePrice} onChange={(e) => setItem(i, 'purchasePrice', e.target.value)} />
              {items.length > 1 && <button type="button" className="text-left text-xs text-red-700 underline sm:col-span-6" onClick={() => setItems(items.filter((_, j) => j !== i))}>Retirer cette ligne</button>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2"><Button variant="outline" type="button" onClick={() => setItems([...items, { ...blank }])}>+ Ajouter une ligne</Button><Button disabled={!valid || busy} onClick={submit}>{busy ? 'Enregistrement…' : 'Valider la livraison'}</Button></div>
        {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      </Card>

      {result && (
        <Card className="mt-4 border-emerald-300 bg-emerald-50/40"><h2 className="font-semibold text-emerald-800">✅ Livraison {result.delivery.reference} enregistrée</h2>
          <ul className="mt-2 space-y-1 text-sm">{result.movements.map((m: Obj, i: number) => <li key={i}><b>{medName(result.itemsSent[i].medicineId)}</b> : stock {m.previousQuantity} → <b className="text-emerald-700">{m.newQuantity}</b> (+{m.newQuantity - m.previousQuantity}) · mouvement « delivery_received » créé</li>)}</ul>
          <p className="mt-2 text-xs text-ink/60">Disponibilité actualisée, alertes recalculées, action enregistrée dans l’audit.</p></Card>
      )}

      <Card className="mt-4"><h2 className="mb-2 font-semibold">Dernières livraisons</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-ink/50"><tr><th className="py-2">Référence</th><th>Fournisseur</th><th>Date</th><th>Lignes</th><th>Coût</th><th>État</th></tr></thead>
          <tbody>{history.data?.map((d) => <tr key={d._id} className="border-t border-brand-50"><td className="py-2 font-medium">{d.reference}</td><td>{d.supplierName}</td><td>{dt(d.receivedAt)}</td><td>{d.items.length}</td><td>{fcfa(d.totalCost)}</td><td><Badge tone={d.status === 'received' ? 'green' : 'red'}>{d.status === 'received' ? 'Reçue' : d.status}</Badge></td></tr>)}</tbody></table></div></Card>
    </Page>
  );
}
export default function P() { return <RequireRole roles={['PHARMACIST']}><NewDelivery /></RequireRole>; }
