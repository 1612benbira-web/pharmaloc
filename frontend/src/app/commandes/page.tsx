'use client';
import Link from 'next/link';
import { Badge, Card, Notice, Page, useFetch } from '@/components/ui';
import { RequireRole } from '@/lib/auth';
import { dt, fcfa, STATUS_LABEL } from '@/lib/format';
import type { Obj } from '@/lib/api';

export const statusTone = (s: string) => (s === 'delivered' ? 'green' : s === 'cancelled' ? 'red' : s === 'pending' ? 'gray' : 'blue') as 'green' | 'red' | 'gray' | 'blue';

function List() {
  const { data, error } = useFetch<Obj[]>('/orders?limit=50', 15000);
  return (
    <Page title="Mes commandes" subtitle="Suivez vos commandes et votre historique">
      {error && <Notice>{error}</Notice>}
      {data?.length === 0 && <Card className="text-center text-ink/60">Aucune commande pour le moment. <Link className="font-semibold text-brand-700 underline" href="/recherche">Rechercher un médicament</Link></Card>}
      <div className="space-y-3">
        {data?.map((o) => (
          <Link key={o.id} href={`/commandes/${o.id}`} className="block"><Card className="transition hover:border-brand-300">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{o.items.map((i: Obj) => `${i.quantity}× ${i.name}`).join(', ')}</p><Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge></div>
            <p className="mt-1 text-sm text-ink/60">{dt(o.createdAt)} · {o.deliveryType === 'delivery' ? 'Livraison' : 'Retrait'} · {fcfa(o.totalAmount)}</p>
          </Card></Link>
        ))}
      </div>
    </Page>
  );
}
export default function Commandes() { return <RequireRole roles={['PATIENT']}><List /></RequireRole>; }
