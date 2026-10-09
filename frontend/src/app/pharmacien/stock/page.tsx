'use client';
import { useState } from 'react';
import { Badge, Button, Card, Input, Notice, Page, Select, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { fcfa } from '@/lib/format';

function StockPage() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { data, error, reload } = useFetch<Obj[]>(`/stocks?includeForecast=true&limit=100${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const meds = useFetch<Obj[]>('/medicines?limit=100');
  const [adj, setAdj] = useState<{ id: string; delta: string; note: string; batch: string; exp: string } | null>(null);
  const [add, setAdd] = useState({ medicineId: '', unitPrice: '', minimumQuantity: '10', maximumQuantity: '' });
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null);

  const doAdjust = async () => {
    if (!adj) return;
    try {
      const d = Number(adj.delta);
      await api(`/stocks/${adj.id}/adjust`, { method: 'POST', body: { delta: d, note: adj.note, ...(d > 0 && { batchNumber: adj.batch, expirationDate: adj.exp }) } });
      setMsg({ t: 'ok', m: 'Ajustement enregistré (mouvement tracé).' }); setAdj(null); reload();
    } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); }
  };
  const doAdd = async () => {
    try {
      await api('/stocks', { method: 'POST', body: { medicineId: add.medicineId, unitPrice: Number(add.unitPrice || 0), minimumQuantity: Number(add.minimumQuantity), ...(add.maximumQuantity && { maximumQuantity: Number(add.maximumQuantity) }) } });
      setMsg({ t: 'ok', m: 'Produit ajouté à votre catalogue. Enregistrez une « Nouvelle livraison » pour l’approvisionner.' }); reload();
    } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); }
  };

  return (
    <Page title="Gestion du stock" subtitle="Disponibilité, seuils et prévisions de rupture">
      {msg && <div className="mb-3"><Notice tone={msg.t}>{msg.m}</Notice></div>}{error && <Notice>{error}</Notice>}
      <Card className="mb-4"><div className="grid gap-3 sm:grid-cols-3"><Input label="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom du médicament" />
        <Select label="État" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tous</option><option value="ok">Normal</option><option value="low">Stock faible</option><option value="out">Rupture</option></Select></div></Card>

      <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase tracking-wide text-ink/60"><tr><th className="p-3">Médicament</th><th>Stock</th><th>Réservé</th><th>Disponible</th><th>Min</th><th>Prix</th><th>État</th><th>Prévision</th><th /></tr></thead>
          <tbody>
            {data?.map((s) => (
              <tr key={s.id} className="border-t border-brand-50">
                <td className="p-3 font-medium">{s.medicine?.name} {s.medicine?.dosage}</td><td>{s.quantity}</td><td>{s.reservedQuantity}</td><td>{s.available}</td><td>{s.minimumQuantity}</td><td>{fcfa(s.unitPrice)}</td>
                <td>{s.status === 'out' ? <Badge tone="red">🔴 RUPTURE</Badge> : s.status === 'low' ? <Badge tone="amber">⚠ STOCK FAIBLE</Badge> : <Badge tone="green">Normal</Badge>}</td>
                <td className="text-xs">{s.forecast?.daysRemaining != null ? <span className={s.forecast.daysRemaining <= 7 ? 'font-semibold text-red-700' : ''} title={s.forecast.explanation}>~{Math.ceil(s.forecast.daysRemaining)} j ({s.forecast.avgDailyConsumption}/j)</span> : <span className="text-ink/40">—</span>}</td>
                <td className="pr-3 text-right"><Button variant="ghost" onClick={() => setAdj({ id: s.id, delta: '', note: '', batch: '', exp: '' })}>Ajuster</Button></td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-ink/50">Aucun produit.</td></tr>}
          </tbody>
        </table>
      </div>

      {adj && (
        <Card className="mt-4"><h2 className="mb-3 font-semibold">Ajustement manuel</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Input label="Variation (+/−)" type="number" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value })} placeholder="-3 (casse) ou +5" />
            <div className="sm:col-span-3"><Input label="Motif (obligatoire)" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder="Inventaire, casse, perte…" /></div>
            {Number(adj.delta) > 0 && <><Input label="N° de lot" value={adj.batch} onChange={(e) => setAdj({ ...adj, batch: e.target.value })} /><Input label="Expiration" type="month" value={adj.exp} onChange={(e) => setAdj({ ...adj, exp: e.target.value })} /></>}
          </div>
          <div className="mt-3 flex gap-2"><Button onClick={doAdjust} disabled={!adj.delta || adj.note.length < 3}>Enregistrer</Button><Button variant="outline" onClick={() => setAdj(null)}>Annuler</Button></div></Card>
      )}

      <Card className="mt-4"><h2 className="mb-3 font-semibold">Ajouter un médicament au catalogue de ma pharmacie</h2>
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="sm:col-span-2"><Select label="Médicament" value={add.medicineId} onChange={(e) => setAdd({ ...add, medicineId: e.target.value })}><option value="">Choisir…</option>{meds.data?.map((m) => <option key={m.id} value={m.id}>{m.name} {m.dosage}</option>)}</Select></div>
          <Input label="Prix (FCFA)" type="number" min="0" value={add.unitPrice} onChange={(e) => setAdd({ ...add, unitPrice: e.target.value })} />
          <Input label="Stock minimum" type="number" min="0" value={add.minimumQuantity} onChange={(e) => setAdd({ ...add, minimumQuantity: e.target.value })} />
          <Input label="Stock maximum" type="number" min="0" value={add.maximumQuantity} onChange={(e) => setAdd({ ...add, maximumQuantity: e.target.value })} />
        </div><Button className="mt-3" disabled={!add.medicineId} onClick={doAdd}>Ajouter</Button></Card>
    </Page>
  );
}
export default function P() { return <RequireRole roles={['PHARMACIST']}><StockPage /></RequireRole>; }
