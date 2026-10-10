'use client';
import { useState } from 'react';
import { Badge, BarChart, Button, Card, Input, Notice, Page, Select, Stat, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { ALERT_LABEL, dt, fcfa, STATUS_LABEL } from '@/lib/format';
import { osmPoint } from '@/lib/location';

const TABS = ['Aperçu', 'Demandes', 'Pharmacies', 'Utilisateurs', 'Livreurs', 'Audit'] as const;
const ROLE_LABEL: Record<string, string> = { PATIENT: 'Patients', PHARMACIST: 'Pharmaciens', DELIVERY_AGENT: 'Livreurs', ADMIN: 'Admins' };

function Admin() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Aperçu');
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null);
  const dash = useFetch<Obj>('/dashboard/admin', 30000);
  const requests = useFetch<Obj[]>('/users/requests', 20000);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const pharmacies = useFetch<Obj[]>(tab === 'Pharmacies' ? '/pharmacies?all=true&limit=100' : null);
  const users = useFetch<Obj[]>(tab === 'Utilisateurs' ? '/users?limit=100' : null);
  const agents = useFetch<Obj[]>(tab === 'Livreurs' ? '/agents' : null);
  const audit = useFetch<Obj[]>(tab === 'Audit' ? '/audit-logs?limit=50' : null);
  const [nu, setNu] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'PHARMACIST', pharmacyId: '' });
  const run = async (fn: () => Promise<unknown>, ok: string, reload: () => void) => { try { await fn(); setMsg({ t: 'ok', m: ok }); reload(); dash.reload(); } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); } };
  const decide = (id: string, decision: 'approve' | 'reject') =>
    run(() => api(`/users/${id}/approval`, { method: 'POST', body: decision === 'reject' ? { decision, reason: reasons[id] } : { decision } }), decision === 'approve' ? 'Demande acceptée.' : 'Demande refusée.', requests.reload);
  const s = dash.data?.stats; const c = dash.data?.charts;

  return (
    <Page title="Administration" subtitle="Supervision de la plateforme">
      <div className="mb-4 flex flex-wrap gap-1 border-b border-brand-100">{TABS.map((t) => <button key={t} onClick={() => { setTab(t); setMsg(null); }} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === t ? 'bg-brand-600 text-white' : 'text-brand-800 hover:bg-brand-50'}`}>{t}{t === 'Demandes' && !!requests.data?.length && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{requests.data.length}</span>}</button>)}</div>
      {msg && <div className="mb-3"><Notice tone={msg.t}>{msg.m}</Notice></div>}

      {tab === 'Aperçu' && s && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Utilisateurs" value={s.users} /><Stat label="Pharmacies" value={s.pharmacies} /><Stat label="À valider" value={s.pharmaciesPendingValidation} tone={s.pharmaciesPendingValidation ? 'amber' : undefined} /><Stat label="Médicaments" value={s.medicines} />
            <Stat label="Commandes" value={s.orders} /><Stat label="Chiffre d’affaires livré" value={fcfa(s.revenue)} tone="green" /><Stat label="Livraisons actives" value={s.activeDeliveries} /><Stat label="Alertes stock ouvertes" value={s.openAlerts} tone={s.openAlerts ? 'red' : undefined} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card><h2 className="mb-2 font-semibold">Commandes par jour</h2><BarChart data={c.ordersPerDay} x="date" y="orders" color="#0ea5e9" /></Card>
            <Card><h2 className="mb-2 font-semibold">Chiffre d’affaires par jour</h2><BarChart data={c.ordersPerDay} x="date" y="revenue" fmt={fcfa} /></Card>
            <Card><h2 className="mb-2 font-semibold">Commandes par statut</h2><div className="space-y-1 text-sm">{c.ordersByStatus.map((o: Obj) => <div key={o.status} className="flex items-center gap-2"><span className="w-32">{STATUS_LABEL[o.status]}</span><div className="h-3 flex-1 rounded bg-brand-50"><div className="h-3 rounded bg-brand-600" style={{ width: `${(o.count / Math.max(1, s.orders)) * 100}%` }} /></div><b>{o.count}</b></div>)}</div></Card>
            <Card><h2 className="mb-2 font-semibold">Utilisateurs et alertes</h2><div className="flex flex-wrap gap-2">{Object.entries(s.usersByRole).map(([r, n]) => <span key={r} className="rounded-lg bg-brand-50 px-3 py-2 text-sm">{ROLE_LABEL[r]} <b>{String(n)}</b></span>)}</div>
              <div className="mt-3 flex flex-wrap gap-2">{c.alertsByType.map((a: Obj) => <Badge key={a.type} tone="amber">{ALERT_LABEL[a.type]} : {a.count}</Badge>)}{c.alertsByType.length === 0 && <span className="text-sm text-ink/50">Aucune alerte.</span>}</div>
              <p className="mt-3 text-sm text-ink/60">Stocks suivis : {s.stockLines} · en faible/rupture : {s.stockLowOrOut}</p></Card>
          </div>
        </>
      )}

      {tab === 'Demandes' && (
        <div className="space-y-3">
          {requests.data?.length === 0 && <Card className="text-center text-ink/60">Aucune demande en attente ✅</Card>}
          {requests.data?.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="font-semibold">{r.role === 'PHARMACIST' ? '🏪 Pharmacie' : '🛵 Livreur'} · {r.firstName} {r.lastName}</p><p className="text-sm text-ink/60">{r.email} · {r.phone} · demandé le {dt(r.createdAt)}</p></div><Badge tone="amber">À valider</Badge>
              </div>
              {r.pharmacy && (
                <div className="mt-2 rounded-xl bg-brand-50 p-3 text-sm">
                  <p className="font-semibold">{r.pharmacy.name}</p>
                  <p>N° d’agrément : <b>{r.pharmacy.licenseNumber ?? '—'}</b></p>
                  <p>{r.pharmacy.address}{r.pharmacy.neighborhood && `, ${r.pharmacy.neighborhood}`} · {r.pharmacy.city}</p>
                  <p>Livraison {r.pharmacy.offersDelivery ? 'oui' : 'non'} · Retrait {r.pharmacy.offersPickup ? 'oui' : 'non'} · {r.pharmacy.is24h ? '24 h/24' : 'horaires définis'}</p>
                  <a className="underline" target="_blank" rel="noreferrer" href={osmPoint(r.pharmacy.latitude, r.pharmacy.longitude)}>Vérifier la position sur la carte</a>
                </div>
              )}
              {r.courier && <p className="mt-2 rounded-xl bg-brand-50 p-3 text-sm">Véhicule : <b>{r.courier.vehicle ?? '—'}</b></p>}
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Button onClick={() => decide(r.id, 'approve')}>✓ Approuver</Button>
                <div className="min-w-56 flex-1"><Input label="Motif (obligatoire pour refuser)" value={reasons[r.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} /></div>
                <Button variant="danger" disabled={(reasons[r.id] ?? '').trim().length < 3} onClick={() => decide(r.id, 'reject')}>✕ Refuser</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'Pharmacies' && (
        <div className="space-y-3">{pharmacies.data?.map((p) => (
          <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{p.name}</p><p className="text-sm text-ink/60">{p.address} · {p.neighborhood}{p.licenseNumber && ` · agrément ${p.licenseNumber}`}</p><p className="text-xs text-ink/40">ID : {p.id}</p></div>
            <div className="flex items-center gap-2">{p.isValidated ? <Badge tone="green">Validée</Badge> : <Badge tone="amber">En attente</Badge>}
              <Button variant={p.isValidated ? 'outline' : 'primary'} onClick={() => run(() => api(`/pharmacies/${p.id}/validation`, { method: 'PATCH', body: { isValidated: !p.isValidated } }), p.isValidated ? 'Pharmacie suspendue.' : 'Pharmacie validée.', pharmacies.reload)}>{p.isValidated ? 'Suspendre' : 'Valider'}</Button></div></Card>
        ))}</div>
      )}

      {tab === 'Utilisateurs' && (
        <>
          <Card className="mb-4"><h2 className="mb-3 font-semibold">Créer un compte professionnel</h2>
            <div className="grid gap-3 sm:grid-cols-3"><Input label="Prénom" value={nu.firstName} onChange={(e) => setNu({ ...nu, firstName: e.target.value })} /><Input label="Nom" value={nu.lastName} onChange={(e) => setNu({ ...nu, lastName: e.target.value })} /><Input label="Email" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
              <Input label="Mot de passe" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
              <Select label="Rôle" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="PHARMACIST">Pharmacien</option><option value="DELIVERY_AGENT">Livreur</option><option value="ADMIN">Administrateur</option><option value="PATIENT">Patient</option></Select>
              {nu.role === 'PHARMACIST' && <Input label="ID de la pharmacie" value={nu.pharmacyId} onChange={(e) => setNu({ ...nu, pharmacyId: e.target.value })} placeholder="Voir l’onglet Pharmacies" />}</div>
            <Button className="mt-3" onClick={() => run(() => api('/users', { method: 'POST', body: { ...nu, pharmacyId: nu.role === 'PHARMACIST' && nu.pharmacyId ? nu.pharmacyId : undefined } }), 'Compte créé.', users.reload)}>Créer</Button></Card>
          <Card className="overflow-x-auto !p-0"><table className="w-full text-left text-sm"><thead className="bg-brand-50 text-xs uppercase text-ink/60"><tr><th className="p-3">Nom</th><th>Email</th><th>Rôle</th><th>État</th><th /></tr></thead>
            <tbody>{users.data?.map((u) => <tr key={u.id} className="border-t border-brand-50"><td className="p-3">{u.firstName} {u.lastName}</td><td>{u.email}</td><td>{u.role}</td><td>{u.isActive ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>}</td>
              <td className="pr-3 text-right"><Button variant="ghost" onClick={() => run(() => api(`/users/${u.id}/status`, { method: 'PATCH', body: { isActive: !u.isActive } }), u.isActive ? 'Compte désactivé.' : 'Compte réactivé.', users.reload)}>{u.isActive ? 'Désactiver' : 'Réactiver'}</Button></td></tr>)}</tbody></table></Card>
        </>
      )}

      {tab === 'Livreurs' && (
        <div className="grid gap-3 sm:grid-cols-2">{agents.data?.map((a) => (
          <Card key={a.user._id}><div className="flex justify-between"><p className="font-semibold">{a.user.firstName} {a.user.lastName}</p>{a.profile?.isAvailable ? <Badge tone="green">Disponible</Badge> : <Badge tone="gray">Indisponible</Badge>}</div>
            <p className="text-sm text-ink/60">{a.profile?.vehicle ?? 'Véhicule non renseigné'} · {a.activeDeliveries} livraison(s) en cours</p></Card>
        ))}</div>
      )}

      {tab === 'Audit' && (
        <Card className="overflow-x-auto !p-0"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-brand-50 text-xs uppercase text-ink/60"><tr><th className="p-3">Date</th><th>Action</th><th>Entité</th><th>Détails</th><th>IP</th></tr></thead>
          <tbody>{audit.data?.map((l) => <tr key={l._id} className="border-t border-brand-50"><td className="p-3">{dt(l.createdAt)}</td><td className="font-medium">{l.action}</td><td>{l.entity ?? '—'}</td><td className="max-w-xs truncate text-ink/60">{l.metadata ? JSON.stringify(l.metadata) : ''}</td><td className="text-ink/50">{l.ip}</td></tr>)}</tbody></table></Card>
      )}
    </Page>
  );
}
export default function P() { return <RequireRole roles={['ADMIN']}><Admin /></RequireRole>; }
