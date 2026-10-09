'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, BarChart, Button, Card, LineChart, Notice, Page, Stat, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { ALERT_LABEL, fcfa, MOVE_LABEL } from '@/lib/format';

function Dashboard() {
  const { data, error, reload } = useFetch<Obj>('/dashboard/pharmacy', 20000);
  const [msg, setMsg] = useState('');
  const refresh = async () => { try { const r = await api<{ data: Obj }>('/alerts/refresh', { method: 'POST', body: {} }); setMsg(`Alertes recalculées (${r.data.stocksChecked} produits, ${r.data.swept.unitsRemoved} unités expirées retirées).`); reload(); } catch (e) { setMsg(errMsg(e)); } };
  const s = data?.stats; const c = data?.charts;
  return (
    <Page title="Tableau de bord" subtitle="Vue d’ensemble de votre pharmacie" actions={<div className="flex gap-2"><Button variant="outline" onClick={refresh}>Recalculer les alertes</Button><Link href="/pharmacien/livraison" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ Nouvelle livraison</Link></div>}>
      {error && <Notice>{error}</Notice>}{msg && <div className="mb-3"><Notice tone="info">{msg}</Notice></div>}
      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Ventes aujourd’hui" value={fcfa(s.salesToday)} tone="green" /><Stat label="Commandes du jour" value={s.ordersToday} /><Stat label="À traiter" value={s.ordersPending} tone={s.ordersPending ? 'amber' : undefined} /><Stat label="Livraisons reçues" value={s.deliveriesReceivedToday} />
            <Stat label="Produits disponibles" value={s.productsAvailable} tone="green" /><Stat label="Stock faible" value={s.productsLowStock} tone={s.productsLowStock ? 'amber' : undefined} /><Stat label="En rupture" value={s.productsOutOfStock} tone={s.productsOutOfStock ? 'red' : undefined} />
          </div>
          <Card className="mt-4"><div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Alertes</h2><Link className="text-sm font-medium text-brand-700 underline" href="/pharmacien/reappro">Réapprovisionnement →</Link></div>
            {data!.alerts.length === 0 ? <p className="text-sm text-ink/60">Aucune alerte : tout est sous contrôle ✅</p> : (
              <ul className="divide-y divide-brand-50">{data!.alerts.map((a: Obj) => (
                <li key={a._id} className="flex flex-wrap items-center gap-2 py-2 text-sm"><Badge tone={a.severity === 'critical' ? 'red' : 'amber'}>{ALERT_LABEL[a.type]}</Badge><span>{a.message}</span></li>
              ))}</ul>)}
          </Card>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card><h2 className="mb-2 font-semibold">Évolution des ventes (14 j)</h2><BarChart data={c.sales} x="date" y="amount" fmt={fcfa} /></Card>
            <Card><h2 className="mb-2 font-semibold">Évolution du stock total</h2><LineChart data={c.stockEvolution} x="date" y="quantity" /></Card>
            <Card><h2 className="mb-2 font-semibold">Commandes par jour</h2><BarChart data={c.ordersPerDay} x="date" y="orders" color="#0ea5e9" /></Card>
            <Card><h2 className="mb-2 font-semibold">Médicaments les plus vendus (14 j)</h2>
              {c.topSelling.length === 0 ? <p className="text-sm text-ink/60">Pas encore de ventes.</p> : <ul className="space-y-2 text-sm">{c.topSelling.map((t: Obj) => <li key={t.medicineId}><div className="flex justify-between"><span>{t.name}</span><b>{t.quantity}</b></div><div className="h-2 rounded bg-brand-50"><div className="h-2 rounded bg-brand-600" style={{ width: `${(t.quantity / c.topSelling[0].quantity) * 100}%` }} /></div></li>)}</ul>}</Card>
            <Card className="md:col-span-2"><h2 className="mb-2 font-semibold">Mouvements de stock (14 j)</h2><div className="flex flex-wrap gap-2">{c.movementsByType.map((m: Obj) => <span key={m.type} className="rounded-lg bg-brand-50 px-3 py-2 text-sm">{MOVE_LABEL[m.type]} <b className="ml-1">{m.count}</b></span>)}</div></Card>
          </div>
        </>
      )}
    </Page>
  );
}
export default function P() { return <RequireRole roles={['PHARMACIST']}><Dashboard /></RequireRole>; }
