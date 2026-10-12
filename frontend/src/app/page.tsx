'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Card, useFetch } from '@/components/ui';
import { type Obj } from '@/lib/api';
import { useAuth, HOME } from '@/lib/auth';
import { openLabel } from '@/lib/format';

const steps = [
  ['1', 'Recherchez', 'Tapez le nom du médicament et voyez les pharmacies qui l’ont en stock.'],
  ['2', 'Commandez', 'Choisissez votre pharmacie, la quantité, puis retrait ou livraison.'],
  ['3', 'Recevez', 'Suivez votre commande en direct jusqu’à la confirmation de livraison.'],
];
const POPULAR = ['Paracétamol 1000 mg', 'Ibuprofène 400 mg', 'Amoxicilline 500 mg', 'Zinc 20 mg', 'Cétirizine 10 mg'];

export default function Home() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [q, setQ] = useState('');
  const near = useFetch<Obj[]>('/pharmacies?limit=3');
  useEffect(() => { if (ready && user && user.role !== 'PATIENT') router.replace(HOME[user.role] ?? '/'); }, [ready, user, router]);

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-3xl px-5 pb-14 pt-10 text-center sm:pt-16">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">Trouvez vos médicaments sans perdre de temps.</h1>
          <p className="mt-4 text-base text-ink/70 sm:text-lg">Vérifiez les stocks des pharmacies proches de vous et faites-vous livrer.</p>
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) router.push(`/recherche?q=${encodeURIComponent(q.trim())}`); }} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <label htmlFor="q" className="sr-only">Médicament</label>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Quel médicament recherchez-vous ?" autoComplete="off"
              className="w-full flex-1 rounded-xl border border-brand-200 bg-white px-5 py-4 text-base shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
            <button className="rounded-xl bg-brand-600 px-8 py-4 font-semibold text-white shadow-sm hover:bg-brand-700">Rechercher</button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <h2 className="text-xl font-bold">Médicaments populaires</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {POPULAR.map((p) => <Link key={p} href={`/recherche?q=${encodeURIComponent(p)}`} className="rounded-full border border-brand-200 px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50">{p}</Link>)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-4">
        <div className="flex items-end justify-between"><h2 className="text-xl font-bold">Pharmacies proches</h2><Link href="/recherche" className="text-sm font-medium text-brand-700 hover:underline">Tout voir</Link></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {near.data?.map((p) => (
            <Card key={p.id}><div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{p.name}</h3>{p.isOpen ? <Badge tone="green">Ouverte</Badge> : <Badge tone="gray">Fermée</Badge>}</div>
              <p className="mt-1 text-sm text-ink/60">{p.address}</p><p className="mt-1 text-xs font-medium text-ink/70">{openLabel(p.openStatus, p.isOpen)}</p><p className="mt-2 text-xs text-ink/50">Livraison {p.offersDelivery ? 'disponible' : 'non proposée'} · Retrait {p.offersPickup ? 'disponible' : 'non proposé'}</p></Card>
          )) ?? <p className="text-sm text-ink/50">Chargement…</p>}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="text-center text-2xl font-bold">Comment ça marche</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map(([n, t, d]) => (
            <li key={n} className="rounded-2xl border border-brand-100 p-6"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">{n}</span><h3 className="mt-4 text-lg font-semibold">{t}</h3><p className="mt-1 text-sm text-ink/70">{d}</p></li>
          ))}
        </ol>
        <div className="mt-8 rounded-2xl bg-brand-50 p-6 text-center"><h3 className="font-semibold text-brand-800">Suivre ma commande</h3>
          <p className="mt-1 text-sm text-ink/60">Retrouvez l’état de votre commande, votre code de livraison et votre historique.</p>
          <Link href="/commandes" className="mt-3 inline-block rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700">Mes commandes</Link></div>
      </section>
    </>
  );
}
