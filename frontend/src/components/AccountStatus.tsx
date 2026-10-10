'use client';
import { useEffect } from 'react';
import { api, session, type Obj } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card } from './ui';

const WHO: Record<string, string> = { PHARMACIST: 'de votre pharmacie', DELIVERY_AGENT: 'de votre profil de livreur' };

/** Écran affiché aux comptes en attente ou refusés ; se met à jour tout seul dès que l'administrateur décide. */
export function AccountStatus() {
  const { user, logout } = useAuth();
  useEffect(() => {
    const check = async () => {
      try {
        const r = await api<{ data: Obj }>('/auth/me');
        const s = session.get();
        if (s && r.data.approvalStatus !== s.user.approvalStatus) session.set({ ...s, user: r.data });
      } catch { /* hors-ligne : on réessaiera */ }
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);
  if (!user) return null;
  const rejected = user.approvalStatus === 'rejected';
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <Card className="space-y-3 text-center">
        <p className="text-4xl">{rejected ? '⛔' : '⏳'}</p>
        <h1 className="text-xl font-extrabold">{rejected ? 'Demande refusée' : 'Demande en cours de validation'}</h1>
        {rejected ? (
          <>
            <p className="text-sm text-ink/70">L’équipe PharmaLoc n’a pas pu valider votre demande.</p>
            {user.rejectionReason && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800"><b>Motif :</b> {user.rejectionReason}</p>}
            <p className="text-sm text-ink/60">Vous pouvez contacter l’administration ou créer une nouvelle demande avec des informations corrigées.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-ink/70">Merci {user.firstName} ! Un administrateur vérifie les informations {WHO[user.role] ?? 'de votre compte'}. Vous n’avez rien à faire : cette page se met à jour automatiquement.</p>
            <p className="text-xs text-ink/50">Tant que la demande n’est pas acceptée, l’accès aux fonctions professionnelles est fermé.</p>
          </>
        )}
        <Button variant="outline" onClick={logout}>Se déconnecter</Button>
      </Card>
    </main>
  );
}
