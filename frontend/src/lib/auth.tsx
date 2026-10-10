'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, session, type Obj, type Session } from './api';
import { AccountStatus } from '@/components/AccountStatus';

interface Ctx { user: Obj | null; ready: boolean; login(email: string, password: string): Promise<Obj>; register(d: Obj, kind?: 'pharmacy' | 'courier'): Promise<Obj>; logout(): Promise<void> }
const AuthCtx = createContext<Ctx>(null as never);
export const useAuth = () => useContext(AuthCtx);

export const HOME: Record<string, string> = { PATIENT: '/', PHARMACIST: '/pharmacien', DELIVERY_AGENT: '/livreur', ADMIN: '/admin' };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Obj | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setUser(session.get()?.user ?? null);
    sync(); setReady(true);
    window.addEventListener('pharmaloc:session', sync);
    return () => window.removeEventListener('pharmaloc:session', sync);
  }, []);
  const start = (r: { data: Session }) => { session.set(r.data); return r.data.user; };
  const login = useCallback(async (email: string, password: string) => start(await api<{ data: Session }>('/auth/login', { method: 'POST', body: { email, password } })), []);
  const register = useCallback(
    async (d: Obj, kind?: 'pharmacy' | 'courier') => start(await api<{ data: Session }>(kind ? `/auth/register/${kind}` : '/auth/register', { method: 'POST', body: d })),
    [],
  );
  const logout = useCallback(async () => { try { await api('/auth/logout', { method: 'POST' }); } catch { /* session déjà invalide */ } session.set(null); }, []);
  return <AuthCtx.Provider value={{ user, ready, login, register, logout }}>{children}</AuthCtx.Provider>;
}

/** Garde d'affichage uniquement : les permissions réelles sont appliquées par l'API. */
export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace('/connexion'); }, [ready, user, router]);
  if (!ready || !user) return <p className="p-8 text-center text-ink/60">Chargement…</p>;
  if (user.approvalStatus && user.approvalStatus !== 'approved') return <AccountStatus />;
  if (!roles.includes(user.role)) return <p className="p-8 text-center text-red-700">Accès réservé. Connectez-vous avec un compte autorisé.</p>;
  return <>{children}</>;
}
