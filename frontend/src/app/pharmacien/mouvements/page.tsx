'use client';
import { useState } from 'react';
import { Badge, Card, Notice, Page, Select, useFetch } from '@/components/ui';
import { type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { dt, MOVE_LABEL } from '@/lib/format';

function Movements() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useFetch<Obj[]>(`/stock-movements?limit=25&page=${page}${type ? `&type=${type}` : ''}`);
  return (
    <Page title="Historique des mouvements" subtitle="Chaque changement de stock est tracé : type, quantité, avant/après, référence, utilisateur" actions={<div className="w-56"><Select aria-label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">Tous les types</option>{Object.entries(MOVE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>}>
      {error && <Notice>{error}</Notice>}
      <Card className="overflow-x-auto !p-0"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-brand-50 text-xs uppercase text-ink/60"><tr><th className="p-3">Date</th><th>Type</th><th>Médicament</th><th>Qté</th><th>Avant → Après</th><th>Référence</th></tr></thead>
        <tbody>{data?.map((m) => <tr key={m.id} className="border-t border-brand-50"><td className="p-3">{dt(m.createdAt)}</td><td><Badge tone={m.quantity > 0 ? 'green' : m.quantity < 0 ? 'red' : 'blue'}>{MOVE_LABEL[m.type]}</Badge></td><td>{m.medicine?.name} {m.medicine?.dosage}</td>
          <td className={m.quantity > 0 ? 'font-semibold text-emerald-700' : m.quantity < 0 ? 'font-semibold text-red-700' : ''}>{m.quantity !== 0 ? (m.quantity > 0 ? '+' : '') + m.quantity : m.reservedDelta > 0 ? `réservé +${m.reservedDelta}` : `libéré ${m.reservedDelta}`}</td><td>{m.previousQuantity} → {m.newQuantity}</td><td className="text-ink/60">{m.reference ?? '—'}</td></tr>)}</tbody></table></Card>
      <div className="mt-3 flex justify-center gap-2 text-sm"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-brand-200 px-3 py-1 disabled:opacity-40">Précédent</button><span className="px-2 py-1">Page {page}</span><button disabled={(data?.length ?? 0) < 25} onClick={() => setPage(page + 1)} className="rounded-lg border border-brand-200 px-3 py-1 disabled:opacity-40">Suivant</button></div>
    </Page>
  );
}
export default function P() { return <RequireRole roles={['PHARMACIST']}><Movements /></RequireRole>; }
