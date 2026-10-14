'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useFetch } from './ui';

const NAV: Record<string, [string, string][]> = {
  PATIENT: [['Rechercher', '/recherche'], ['Mes commandes', '/commandes']],
  PHARMACIST: [['Tableau de bord', '/pharmacien'], ['Stock', '/pharmacien/stock'], ['Nouvelle livraison', '/pharmacien/livraison'], ['Commandes', '/pharmacien/commandes'], ['Réappro', '/pharmacien/reappro'], ['Mouvements', '/pharmacien/mouvements'], ['Paiements', '/pharmacien/paiements'], ['Paramètres', '/pharmacien/parametres']],
  DELIVERY_AGENT: [['Mes livraisons', '/livreur'], ['Mes gains', '/livreur/gains']],
  ADMIN: [['Administration', '/admin']],
};

export function Header() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const unread = useFetch<{ unread: number }>(user && (user.approvalStatus ?? 'approved') === 'approved' ? '/notifications/unread-count' : null, 30000);
  const nav = user ? NAV[user.role] ?? [] : [['Rechercher', '/recherche']];
  return (
    <header className="sticky top-0 z-20 border-b border-brand-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-brand-700">PHARMALOC</Link>
        <nav className="flex flex-1 flex-wrap gap-1 text-sm font-medium">
          {nav.map(([l, h]) => <Link key={h} href={h} className="rounded-lg px-2.5 py-1.5 text-brand-900 hover:bg-brand-50">{l}</Link>)}
        </nav>
        <div className="flex items-center gap-2 text-sm">
          {(!user || user.role === 'PATIENT') && <Link href="/panier" className="relative rounded-lg px-2.5 py-1.5 hover:bg-brand-50" aria-label="Panier">🛒{count > 0 && <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-xs text-white">{count}</span>}</Link>}
          {user ? (
            <>
              <Link href="/notifications" className="rounded-lg px-2.5 py-1.5 hover:bg-brand-50" aria-label="Notifications">🔔{!!unread.data?.unread && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{unread.data.unread}</span>}</Link>
              <span className="hidden text-ink/60 sm:inline">{user.firstName}</span>
              <button onClick={logout} className="rounded-lg px-2.5 py-1.5 text-brand-800 hover:bg-brand-50">Déconnexion</button>
            </>
          ) : (
            <><Link href="/connexion" className="rounded-lg px-2.5 py-1.5 hover:bg-brand-50">Connexion</Link><Link href="/inscription" className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700">Créer un compte</Link></>
          )}
        </div>
      </div>
    </header>
  );
}
