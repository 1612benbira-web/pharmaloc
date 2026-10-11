'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Notice, Select } from '@/components/ui';
import { errMsg } from '@/lib/api';
import { HOME, useAuth } from '@/lib/auth';
import { getPosition } from '@/lib/location';
import { QUARTIERS } from '@/lib/quartiers';
import { LazyMap, MapView } from '@/components/MapView';

type Kind = 'patient' | 'pharmacy' | 'courier';
const KINDS: { id: Kind; icon: string; title: string; text: string }[] = [
  { id: 'patient', icon: '🧑', title: 'Patient', text: 'Trouver et commander mes médicaments. Accès immédiat.' },
  { id: 'pharmacy', icon: '🏪', title: 'Pharmacie', text: 'Gérer mon stock et mes commandes. Validation par l’équipe PharmaLoc.' },
  { id: 'courier', icon: '🛵', title: 'Livreur', text: 'Livrer des médicaments. Validation par l’équipe PharmaLoc.' },
];
const VEHICLES = ['Moto', 'Scooter', 'Vélo', 'Voiture'];

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('patient');
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [ph, setPh] = useState({ name: '', licenseNumber: '', address: '', quartier: '', city: 'Dakar', is24h: false, open: '08:00', close: '20:00', offersDelivery: true, offersPickup: true });
  const [vehicle, setVehicle] = useState('Moto');
  const [pos, setPos] = useState<{ latitude: number; longitude: number; source: 'gps' | 'quartier' | 'map' } | null>(null);
  const [fitKey, setFitKey] = useState('init');
  const [error, setError] = useState('');
  const [geoMsg, setGeoMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const locate = async () => {
    try { const p = await getPosition(); setPos({ latitude: p.latitude, longitude: p.longitude, source: 'gps' }); setFitKey(String(Date.now())); setGeoMsg(`Position enregistrée (précision ≈ ${p.accuracy} m).`); }
    catch (e) { setGeoMsg((e as Error).message + ' Choisissez le quartier de la pharmacie.'); }
  };
  const pickQuartier = (name: string) => {
    setPh({ ...ph, quartier: name });
    const q = QUARTIERS.find((x) => x.name === name);
    if (q && pos?.source !== 'gps' && pos?.source !== 'map') { setPos({ latitude: q.lat, longitude: q.lng, source: 'quartier' }); setFitKey(String(Date.now())); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      let user;
      if (kind === 'patient') user = await register({ ...f, phone: f.phone || undefined });
      else if (kind === 'courier') user = await register({ ...f, vehicle }, 'courier');
      else {
        if (!pos) throw new Error('Indiquez la position de la pharmacie (bouton GPS ou quartier).');
        user = await register({
          email: f.email, password: f.password, firstName: f.firstName, lastName: f.lastName, phone: f.phone,
          pharmacy: {
            name: ph.name, licenseNumber: ph.licenseNumber, address: ph.address, city: ph.city, ...(ph.quartier && { neighborhood: ph.quartier }),
            latitude: pos.latitude, longitude: pos.longitude, is24h: ph.is24h, offersDelivery: ph.offersDelivery, offersPickup: ph.offersPickup,
            ...(!ph.is24h && { openingHours: Array.from({ length: 7 }, (_, day) => ({ day, open: ph.open, close: ph.close })) }),
          },
        }, 'pharmacy');
      }
      router.push(HOME[user.role] ?? '/');
    } catch (err) { setError(err instanceof Error && !('status' in err) ? err.message : errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-extrabold">Créer un compte</h1>
      <p className="mt-1 text-sm text-ink/60">Choisissez votre profil.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {KINDS.map((k) => (
          <button key={k.id} type="button" onClick={() => { setKind(k.id); setError(''); }}
            className={`rounded-2xl border p-4 text-left transition ${kind === k.id ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-200' : 'border-brand-100 hover:border-brand-300'}`}>
            <span className="text-2xl">{k.icon}</span><p className="mt-1 font-semibold">{k.title}</p><p className="mt-1 text-xs text-ink/60">{k.text}</p>
          </button>
        ))}
      </div>

      <Card className="mt-4">
        <form onSubmit={submit} className="space-y-3">
          {kind !== 'patient' && <Notice tone="info">Votre demande sera examinée par un administrateur. Tant qu’elle n’est pas acceptée, vous ne pourrez pas utiliser les fonctions professionnelles.</Notice>}
          <h2 className="font-semibold">{kind === 'pharmacy' ? 'Le responsable de la pharmacie' : 'Vos informations'}</h2>
          <div className="grid grid-cols-2 gap-3"><Input label="Prénom" value={f.firstName} onChange={set('firstName')} required /><Input label="Nom" value={f.lastName} onChange={set('lastName')} required /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Email" type="email" value={f.email} onChange={set('email')} required />
            <Input label={kind === 'patient' ? 'Téléphone (optionnel)' : 'Téléphone'} value={f.phone} onChange={set('phone')} placeholder="+221 77 000 00 00" required={kind !== 'patient'} />
          </div>
          <Input label="Mot de passe" type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
          <p className="text-xs text-ink/50">8 caractères minimum, avec au moins une lettre et un chiffre.</p>

          {kind === 'courier' && <Select label="Véhicule" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>{VEHICLES.map((v) => <option key={v}>{v}</option>)}</Select>}

          {kind === 'pharmacy' && (
            <>
              <h2 className="pt-2 font-semibold">La pharmacie</h2>
              <div className="grid gap-3 sm:grid-cols-2"><Input label="Nom de la pharmacie" value={ph.name} onChange={(e) => setPh({ ...ph, name: e.target.value })} required /><Input label="N° d’agrément / d’ordre" value={ph.licenseNumber} onChange={(e) => setPh({ ...ph, licenseNumber: e.target.value })} required minLength={3} /></div>
              <Input label="Adresse" value={ph.address} onChange={(e) => setPh({ ...ph, address: e.target.value })} required />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Quartier" value={ph.quartier} onChange={(e) => pickQuartier(e.target.value)}><option value="">Choisir…</option>{QUARTIERS.map((q) => <option key={q.name}>{q.name}</option>)}</Select>
                <Input label="Ville" value={ph.city} onChange={(e) => setPh({ ...ph, city: e.target.value })} required />
              </div>
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="text-sm font-medium">Position de la pharmacie <span className="text-ink/50">(sert à calculer les distances et les frais de livraison)</span></p>
                <div className="mt-2 flex flex-wrap items-center gap-2"><Button type="button" variant="outline" onClick={locate}>📍 Je suis à la pharmacie : utiliser ma position</Button>
                  {pos && <span className="text-xs text-brand-800">{pos.source === 'gps' ? '✓ Position GPS' : pos.source === 'map' ? '✓ Position choisie sur la carte' : '✓ Centre du quartier (approximatif)'}</span>}</div>
                <div className="mt-2"><LazyMap label="Placer / ajuster sur la carte" hint="Cliquez sur la carte ou déplacez le repère sur l’entrée de votre pharmacie pour une position précise.">
                  <MapView markers={pos ? [{ id: 'pharmacy', lat: pos.latitude, lng: pos.longitude, kind: 'pharmacy', draggable: true, title: 'Votre pharmacie (déplacez-moi)', popup: [ph.name || 'Votre pharmacie'] }] : []} fitKey={fitKey} height={300}
                    onPick={(lat, lng) => setPos({ latitude: lat, longitude: lng, source: 'map' })} /></LazyMap></div>
                <p className="mt-1 text-xs text-ink/50">{geoMsg || 'Votre position n’est utilisée qu’avec votre accord, uniquement pour situer la pharmacie.'}</p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600" checked={ph.is24h} onChange={(e) => setPh({ ...ph, is24h: e.target.checked })} />Ouverte 24 h / 24</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600" checked={ph.offersDelivery} onChange={(e) => setPh({ ...ph, offersDelivery: e.target.checked })} />Propose la livraison</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600" checked={ph.offersPickup} onChange={(e) => setPh({ ...ph, offersPickup: e.target.checked })} />Propose le retrait</label>
              </div>
              {!ph.is24h && <div className="grid grid-cols-2 gap-3"><Input label="Ouverture (tous les jours)" type="time" value={ph.open} onChange={(e) => setPh({ ...ph, open: e.target.value })} /><Input label="Fermeture" type="time" value={ph.close} onChange={(e) => setPh({ ...ph, close: e.target.value })} /></div>}
              <p className="text-xs text-ink/50">Les tarifs de livraison (500 FCFA + 150 FCFA/km au-delà de 1 km par défaut) et les horaires détaillés se règlent ensuite dans « Paramètres ».</p>
            </>
          )}

          {error && <Notice>{error}</Notice>}
          <Button className="w-full" disabled={busy}>{kind === 'patient' ? 'Créer mon compte' : 'Envoyer ma demande'}</Button>
        </form>
        <p className="mt-4 text-center text-sm">Déjà inscrit ? <Link href="/connexion" className="font-semibold text-brand-700 underline">Se connecter</Link></p>
      </Card>
    </main>
  );
}
