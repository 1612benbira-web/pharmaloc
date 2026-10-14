'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Notice, Page, Select, Stat, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole, useAuth } from '@/lib/auth';
import { dt, fcfa, OPERATOR_LABEL, SETTLEMENT_KIND, SETTLEMENT_STATUS, settlementTone } from '@/lib/format';

function Payments() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Obj[]>([]);
  const [summary, setSummary] = useState<Obj | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null);
  const pharmacy = useFetch<Obj>(user?.pharmacyId ? `/pharmacies/${user.pharmacyId}` : null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ data: Obj[]; meta: Obj }>(`/settlements?limit=50${status ? `&status=${status}` : ''}`);
      setRows(r.data); setSummary(r.meta.summary ?? null);
    } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); }
  }, [status]);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const due = rows.filter((r) => r.status === 'cash_due');
  const confirm = async (ids: string[]) => {
    try {
      const r = await api<{ data: Obj }>('/settlements/confirm-cash', { method: 'POST', body: { ids } });
      setMsg({ t: r.data.failed.length ? 'error' : 'ok', m: `${r.data.confirmed} remise(s) confirmée(s)${r.data.failed.length ? `, ${r.data.failed.length} refusée(s)` : ''}.` });
      setSelected([]); load();
    } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); }
  };
  const hasAccount = !!pharmacy.data?.payoutPhone;

  return (
    <Page title="Paiements" subtitle="Ce que vous recevez : prix des médicaments, en ligne ou en espèces">
      {msg && <div className="mb-3"><Notice tone={msg.t}>{msg.m}</Notice></div>}
      {pharmacy.data && !hasAccount && <div className="mb-3"><Notice tone="info">Renseignez votre compte <b>Wave ou Orange Money</b> dans <Link className="underline" href="/pharmacien/parametres">Paramètres</Link> pour recevoir automatiquement les paiements en ligne.</Notice></div>}
      <Notice tone="info">Mode DEMO : aucun argent réel. À la confirmation de la livraison, le prix des médicaments est versé à la pharmacie et les frais de livraison au livreur. En espèces, le livreur garde ses frais et vous remet le reste.</Notice>
      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Reçu en ligne" value={fcfa(summary.onlineReceived)} tone="green" />
          <Stat label="En attente de versement" value={fcfa(summary.onlinePending)} tone={summary.onlinePending ? 'amber' : undefined} />
          <Stat label="Espèces à recevoir des livreurs" value={fcfa(summary.cashToReceive)} tone={summary.cashToReceive ? 'amber' : undefined} />
          <Stat label="Espèces reçues" value={fcfa(summary.cashReceived)} />
          <Stat label="Encaissé au comptoir" value={fcfa(summary.cashAtCounter)} />
        </div>
      )}
      <div className="mb-3 mt-5 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold">Commandes livrées</h2>
        <div className="flex flex-wrap items-end gap-2">
          {selected.length > 0 && <Button onClick={() => confirm(selected)}>✓ Confirmer la réception ({selected.length})</Button>}
          {due.length > 1 && <Button variant="outline" onClick={() => setSelected(selected.length === due.length ? [] : due.map((d) => d.id))}>{selected.length === due.length ? 'Tout désélectionner' : 'Tout sélectionner (espèces à recevoir)'}</Button>}
          <div className="w-60"><Select aria-label="Statut" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(SETTLEMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
        </div>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                {r.status === 'cash_due' && <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" aria-label="Sélectionner" checked={selected.includes(r.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))} />}
                <div>
                  <p className="font-semibold">{r.order?.items?.map((i: Obj) => `${i.quantity}× ${i.name}`).join(', ') ?? 'Commande'}</p>
                  <p className="text-sm text-ink/60">{dt(r.releasedAt)} · {SETTLEMENT_KIND[r.kind]} · total {fcfa(r.totalAmount)}</p>
                  <p className="text-sm">Vous : <b>{fcfa(r.pharmacyAmount)}</b>{r.courierAmount > 0 && <span className="text-ink/60"> · livreur (frais de livraison) : {fcfa(r.courierAmount)}</span>}</p>
                  {r.payouts?.filter((p: Obj) => p.recipientType === 'PHARMACY').map((p: Obj) => (
                    <p key={p.id} className="text-xs text-ink/60">Versement {p.status === 'paid' ? `effectué sur ${OPERATOR_LABEL[p.operator] ?? ''} ${p.destination ?? ''}` : p.status === 'failed' ? 'refusé' : 'en attente'}{p.failureReason && ` : ${p.failureReason}`}</p>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={settlementTone(r.status)}>{SETTLEMENT_STATUS[r.status]}</Badge>
                {r.status === 'cash_due' && <Button variant="outline" onClick={() => confirm([r.id])}>J’ai reçu les espèces</Button>}
              </div>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <Card className="text-center text-ink/60">Aucune commande livrée pour le moment.</Card>}
      </div>
    </Page>
  );
}
export default function P() { return <RequireRole roles={['PHARMACIST']}><Payments /></RequireRole>; }
