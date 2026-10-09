'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Notice } from '@/components/ui';
import { errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await register({ ...f, phone: f.phone || undefined }); router.push('/'); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Card><h1 className="text-2xl font-extrabold">Créer un compte</h1>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3"><Input label="Prénom" value={f.firstName} onChange={set('firstName')} required /><Input label="Nom" value={f.lastName} onChange={set('lastName')} required /></div>
          <Input label="Email" type="email" value={f.email} onChange={set('email')} required />
          <Input label="Téléphone (optionnel)" value={f.phone} onChange={set('phone')} placeholder="+221 77 000 00 00" />
          <Input label="Mot de passe" type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
          <p className="text-xs text-ink/50">8 caractères minimum, avec au moins une lettre et un chiffre.</p>
          {error && <Notice>{error}</Notice>}
          <Button className="w-full" disabled={busy}>Créer mon compte</Button>
        </form>
        <p className="mt-4 text-center text-sm">Déjà inscrit ? <Link href="/connexion" className="font-semibold text-brand-700 underline">Se connecter</Link></p></Card>
    </main>
  );
}
