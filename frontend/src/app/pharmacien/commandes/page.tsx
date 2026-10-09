'use client';
import { useState } from 'react';
import { Badge, Button, Card, Input, Notice, Page, Select, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { dt, fcfa, PAY_LABEL, STATUS_LABEL } from '@/lib/format';
import { statusTone } from '../../commandes/page';

function Orders() {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useFetch<Obj[]>(`/orders?limit=50${status ? `&status=${status}` : ''}`, 8000);
  const [msg, setMsg] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const act = async (id: string, action: string, body: object = {}) => { try { await api(`/orders/${id}/${action}`, { method: 'POST', body }); setMsg(''); reload(); } catch (e) { setMsg(errMsg(e)); } };
  return (
    <Page title="Commandes" subtitle="Acceptez, préparez et remettez les commandes" actions={<div className="w-48"><Select aria-label="Statut" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUS_LABEL).filter(([k]) => k !== 'searching').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>}>
      {(error || msg) && <div className="mb-3"><Notice>{error || msg}</Notice></div>}
      <div className="space-y-3">
        {data?.map((o) => (
          <Card key={o.id}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{o.items.map((i: Obj) => `${i.quantity}× ${i.name}`).join(', ')}</p>
              <p className="text-sm text-ink/60">{dt(o.createdAt)} · {o.deliveryType === 'delivery' ? '🛵 Livraison' : '🏪 Retrait'} · {fcfa(o.totalAmount)} · {PAY_LABEL[o.paymentMethod]} ({o.paymentStatus === 'paid' ? 'payé' : o.paymentStatus === 'refunded' ? 'remboursé' : 'à encaisser'})</p>
              {o.prescriptionRequired && <p className="text-sm text-amber-700">⚠ Ordonnance à vérifier</p>}{o.addressSnapshot?.street && <p className="text-sm text-ink/60">📍 {o.addressSnapshot.street}{o.addressSnapshot.neighborhood && `, ${o.addressSnapshot.neighborhood}`}</p>}</div>
              <Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge></div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {o.status === 'pending' && <><Button onClick={() => act(o.id, 'accept')}>Accepter</Button><Button variant="danger" onClick={() => act(o.id, 'reject', { reason: 'Refusée par la pharmacie' })}>Refuser</Button></>}
              {o.status === 'confirmed' && <Button onClick={() => act(o.id, 'prepare')}>Commencer la préparation</Button>}
              {o.status === 'preparing' && <Button onClick={() => act(o.id, 'ready')}>Marquer comme prête</Button>}
              {o.status === 'ready' && o.deliveryType === 'delivery' && <Badge tone="blue">En attente d’un livreur</Badge>}
              {o.status === 'ready' && o.deliveryType === 'pickup' && <><div className="w-40"><Input label="Code du patient" inputMode="numeric" maxLength={6} value={codes[o.id] ?? ''} onChange={(e) => setCodes({ ...codes, [o.id]: e.target.value })} /></div><Button disabled={(codes[o.id] ?? '').length !== 6} onClick={() => act(o.id, 'handover', { code: codes[o.id] })}>Remettre au patient</Button></>}
              {['preparing', 'ready', 'assigned'].includes(o.status) && <Button variant="outline" onClick={() => act(o.id, 'cancel', { reason: 'Annulée par la pharmacie' })}>Annuler</Button>}
            </div>
          </Card>
        ))}
        {data?.length === 0 && <Card className="text-center text-ink/60">Aucune commande.</Card>}
      </div>
    </Page>
  );
}
export default function P() { return <RequireRole roles={['PHARMACIST']}><Orders /></RequireRole>; }
