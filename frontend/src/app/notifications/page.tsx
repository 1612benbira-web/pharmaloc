'use client';
import { Badge, Button, Card, Notice, Page, useFetch } from '@/components/ui';
import { api, type Obj } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { dt } from '@/lib/format';

function Notifs() {
  const { data, error, reload } = useFetch<Obj[]>('/notifications?limit=50', 20000);
  return (
    <Page title="Notifications" actions={<Button variant="outline" onClick={async () => { await api('/notifications/read-all', { method: 'POST' }); reload(); }}>Tout marquer comme lu</Button>}>
      {error && <Notice>{error}</Notice>}
      {data?.length === 0 && <Card className="text-center text-ink/60">Aucune notification.</Card>}
      <div className="space-y-2">{data?.map((n) => (
        <Card key={n._id} className={`!p-4 ${n.readAt ? 'opacity-70' : 'border-brand-300'}`}><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{n.title}</p><p className="text-sm text-ink/70">{n.message}</p><p className="mt-1 text-xs text-ink/40">{dt(n.createdAt)}</p></div>
          {!n.readAt && <button onClick={async () => { await api(`/notifications/${n._id}/read`, { method: 'POST' }); reload(); }}><Badge tone="blue">Nouveau</Badge></button>}</div></Card>
      ))}</div>
    </Page>
  );
}
export default function Page_() { return <RequireRole roles={['PATIENT', 'PHARMACIST', 'DELIVERY_AGENT', 'ADMIN']}><Notifs /></RequireRole>; }
