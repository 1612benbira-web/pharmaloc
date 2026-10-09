'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Notice } from '@/components/ui';
import { errMsg } from '@/lib/api';
import { HOME, useAuth } from '@/lib/auth';

const DEMO = [['Patient', 'patient@pharmaloc.sn'], ['Pharmacien', 'pharmacien@pharmaloc.sn'], ['Livreur', 'livreur@pharmaloc.sn'], ['Admin', 'admin@pharmaloc.sn']];

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e: string, p: string) => {
    setBusy(true); setError('');
    try { const u = await login(e, p); router.push(HOME[u.role] ?? '/'); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Card className="space-y-4">
        <h1 className="text-2xl font-extrabold">Connexion</h1>
        <form onSubmit={(e) => { e.preventDefault(); go(email, password); }} className="space-y-3">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Input label="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          {error && <Notice>{error}</Notice>}
          <Button className="w-full" disabled={busy}>Se connecter</Button>
        </form>
        <p className="text-center text-sm">Pas de compte ? <Link href="/inscription" className="font-semibold text-brand-700 underline">Créer un compte patient</Link></p>
        <div className="rounded-xl bg-brand-50 p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-800">Comptes DEMO (jury)</p>
          <div className="grid grid-cols-2 gap-2">{DEMO.map(([l, e]) => <Button key={e} type="button" variant="outline" disabled={busy} onClick={() => go(e, 'Demo1234')}>{l}</Button>)}</div></div>
      </Card>
    </main>
  );
}
