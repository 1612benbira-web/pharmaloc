'use client';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Input, Notice, Page, Select, Stat, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { dt, fcfa, OPERATOR_LABEL, SETTLEMENT_KIND, SETTLEMENT_STATUS, settlementTone } from '@/lib/format';

function Gains() {
  const [rows, setRows] = useState<Obj[]>([]);
  const [summary, setSummary] = useState<Obj | null>(null);
  const me = useFetch<Obj>('/agents/me');
  const [acct, setAcct] = useState({ operator: 'orange_money', phone: '' });
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null);

  const load = useCallback(async () => {
    try { const r = await api<{ data: Obj[]; meta: Obj }>('/settlements?limit=50'); setRows(r.data); setSummary(r.meta.summary ?? null); }
    catch (e) { setMsg({ t: 'error', m: errMsg(e) }); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (me.data?.payoutOperator) setAcct({ operator: me.data.payoutOperator, phone: me.data.payoutPhone ?? '' }); }, [me.data]);

  const saveAccount = async () => {
    try { await api('/agents/me', { method: 'PATCH', body: { payoutOperator: acct.operator, payoutPhone: acct.phone } }); setMsg({ t: 'ok', m: 'Compte de réception enregistré. Les versements en attente partent maintenant.' }); me.reload(); load(); }
    catch (e) { setMsg({ t: 'error', m: errMsg(e) }); }
  };
  const over = summary && summary.cashToRemit > summary.cashLimit;

  return (
    <Page title="Mes gains" subtitle="Vos frais de livraison et les espèces à remettre aux pharmacies">
      {msg && <div className="mb-3"><Notice tone={msg.t}>{msg.m}</Notice></div>}
      <Notice tone="info">Mode DEMO : aucun argent réel. <b>Vous gardez les frais de livraison</b> de chaque course. Paiement en ligne : ils sont versés sur votre compte à la confirmation de la livraison. Paiement en espèces : vous les gardez sur l’argent encaissé et remettez le reste à la pharmacie.</Notice>
      {over && <div className="mt-3"><Notice>Vous détenez {fcfa(summary!.cashToRemit)} d’espèces à remettre (plafond {fcfa(summary!.cashLimit)}) : <b>vous ne pouvez plus accepter de livraison</b> tant que vous ne les avez pas remises aux pharmacies.</Notice></div>}
      {summary && summary.oldestDueDays >= 2 && !over && <div className="mt-3"><Notice>Des espèces attendent depuis {summary.oldestDueDays} jours : pensez à les remettre à la pharmacie.</Notice></div>}
      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Total gagné (frais)" value={fcfa(summary.totalEarned)} tone="green" />
          <Stat label="Reçu en ligne" value={fcfa(summary.earnedOnline)} />
          <Stat label="Gardé sur les espèces" value={fcfa(summary.earnedCash)} />
          <Stat label="Espèces à remettre" value={fcfa(summary.cashToRemit)} tone={over ? 'red' : summary.cashToRemit ? 'amber' : undefined} />
          <Stat label="Versements en attente" value={fcfa(summary.pendingPayouts)} tone={summary.pendingPayouts ? 'amber' : undefined} />
        </div>
      )}
      <Card className="mt-4 space-y-3">
        <h2 className="font-semibold">Mon compte de réception</h2>
        <p className="text-sm text-ink/60">Numéro Wave ou Orange Money qui reçoit vos frais de livraison payés en ligne. Aucune donnée bancaire n’est demandée.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Opérateur" value={acct.operator} onChange={(e) => setAcct({ ...acct, operator: e.target.value })}><option value="wave">Wave</option><option value="orange_money">Orange Money</option></Select>
          <div className="sm:col-span-2"><Input label="Numéro" inputMode="tel" value={acct.phone} onChange={(e) => setAcct({ ...acct, phone: e.target.value })} placeholder="+221 77 123 45 67" /></div>
        </div>
        <div className="flex items-center gap-3"><Button onClick={saveAccount} disabled={acct.phone.trim().length < 8}>Enregistrer</Button>{me.data?.payoutPhone ? <span className="text-sm text-emerald-700">✓ Compte enregistré</span> : <span className="text-sm text-amber-700">Aucun compte : les versements en ligne resteront en attente.</span>}</div>
      </Card>
      <h2 className="mb-3 mt-6 text-lg font-bold">Historique des courses</h2>
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{r.order?.items?.map((i: Obj) => `${i.quantity}× ${i.name}`).join(', ') ?? 'Livraison'}</p>
                <p className="text-sm text-ink/60">{dt(r.releasedAt)} · {SETTLEMENT_KIND[r.kind]} · total {fcfa(r.totalAmount)}</p>
                {r.kind === 'cash_delivery'
                  ? <p className="text-sm">Vous gardez <b>{fcfa(r.courierAmount)}</b> · à remettre à la pharmacie : <b>{fcfa(r.pharmacyAmount)}</b></p>
                  : <p className="text-sm">Vos frais : <b>{fcfa(r.courierAmount)}</b>{r.payouts?.filter((p: Obj) => p.recipientType === 'COURIER').map((p: Obj) => <span key={p.id} className="text-xs text-ink/60"> · {p.status === 'paid' ? `versé sur ${OPERATOR_LABEL[p.operator] ?? ''} ${p.destination ?? ''}` : p.failureReason ?? 'en attente'}</span>)}</p>}
              </div>
              <Badge tone={settlementTone(r.status)}>{SETTLEMENT_STATUS[r.status]}</Badge>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <Card className="text-center text-ink/60">Aucune course terminée pour le moment.</Card>}
      </div>
    </Page>
  );
}
export default function P() { return <RequireRole roles={['DELIVERY_AGENT']}><Gains /></RequireRole>; }
