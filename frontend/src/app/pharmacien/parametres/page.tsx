'use client';
import { useEffect, useState } from 'react';
import { Button, Card, Input, Notice, Page, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole, useAuth } from '@/lib/auth';
import { fcfa } from '@/lib/format';

/** Même formule que le serveur (modules/pharmacies/deliveryFee.ts) : sert uniquement à l'aperçu. */
const fee = (p: { base: number; perKm: number; included: number }, km: number) =>
  Math.ceil((p.base + p.perKm * Math.max(0, km - p.included)) / 50 - 1e-9) * 50 || 0;

function Settings() {
  const { user } = useAuth();
  const { data, error, reload } = useFetch<Obj>(user?.pharmacyId ? `/pharmacies/${user.pharmacyId}` : null);
  const [f, setF] = useState({ phone: '', base: '500', perKm: '150', included: '1', radius: '10', offersDelivery: true, offersPickup: true, is24h: false, open: '08:00', close: '20:00' });
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    const h = data.openingHours?.[0];
    setF({
      phone: data.phone ?? '', base: String(data.deliveryFee ?? 0), perKm: String(data.deliveryPerKmFee ?? 0), included: String(data.deliveryIncludedKm ?? 0),
      radius: String(data.deliveryRadiusKm ?? 10), offersDelivery: !!data.offersDelivery, offersPickup: !!data.offersPickup, is24h: !!data.is24h, open: h?.open ?? '08:00', close: h?.close ?? '20:00',
    });
  }, [data]);

  const tariff = { base: Number(f.base) || 0, perKm: Number(f.perKm) || 0, included: Number(f.included) || 0 };
  const save = async () => {
    try {
      await api(`/pharmacies/${user!.pharmacyId}`, { method: 'PATCH', body: {
        ...(f.phone && { phone: f.phone }), deliveryFee: Number(f.base), deliveryPerKmFee: Number(f.perKm), deliveryIncludedKm: Number(f.included), deliveryRadiusKm: Number(f.radius),
        offersDelivery: f.offersDelivery, offersPickup: f.offersPickup, is24h: f.is24h,
        ...(!f.is24h && { openingHours: Array.from({ length: 7 }, (_, day) => ({ day, open: f.open, close: f.close })) }),
      } });
      setMsg({ t: 'ok', m: 'Paramètres enregistrés.' }); reload();
    } catch (e) { setMsg({ t: 'error', m: errMsg(e) }); }
  };

  return (
    <Page title="Paramètres de la pharmacie" subtitle={data?.name}>
      {error && <Notice>{error}</Notice>}{msg && <div className="mb-3"><Notice tone={msg.t}>{msg.m}</Notice></div>}
      {data && !data.isValidated && <div className="mb-3"><Notice tone="info">Votre pharmacie n’est pas encore visible des patients (validation en cours).</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold">Tarif de livraison</h2>
          <p className="text-sm text-ink/60">Frais = <b>base</b> + <b>prix par km</b> × (distance − km inclus), arrondi aux 50 FCFA. La distance est mesurée à vol d’oiseau entre votre pharmacie et l’adresse du patient.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Frais de base (FCFA)" type="number" min="0" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} />
            <Input label="Prix par km (FCFA)" type="number" min="0" value={f.perKm} onChange={(e) => setF({ ...f, perKm: e.target.value })} />
            <Input label="Km inclus dans la base" type="number" min="0" step="0.5" value={f.included} onChange={(e) => setF({ ...f, included: e.target.value })} />
            <Input label="Rayon maximum de livraison (km)" type="number" min="0" value={f.radius} onChange={(e) => setF({ ...f, radius: e.target.value })} />
          </div>
          <div className="rounded-xl bg-brand-50 p-3 text-sm"><p className="mb-1 font-medium">Aperçu pour le patient</p>
            <div className="flex flex-wrap gap-2">{[1, 2, 3, 5, 8].filter((km) => km <= Number(f.radius || 0)).map((km) => <span key={km} className="rounded-lg bg-white px-3 py-1">{km} km : <b>{fcfa(fee(tariff, km))}</b></span>)}</div></div>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">Services et horaires</h2>
          <Input label="Téléphone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600" checked={f.offersDelivery} onChange={(e) => setF({ ...f, offersDelivery: e.target.checked })} />Livraison</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600" checked={f.offersPickup} onChange={(e) => setF({ ...f, offersPickup: e.target.checked })} />Retrait</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600" checked={f.is24h} onChange={(e) => setF({ ...f, is24h: e.target.checked })} />Ouverte 24 h / 24</label>
          </div>
          {!f.is24h && <div className="grid grid-cols-2 gap-3"><Input label="Ouverture (tous les jours)" type="time" value={f.open} onChange={(e) => setF({ ...f, open: e.target.value })} /><Input label="Fermeture" type="time" value={f.close} onChange={(e) => setF({ ...f, close: e.target.value })} /></div>}
          <Button onClick={save}>Enregistrer</Button>
        </Card>
      </div>
    </Page>
  );
}
export default function P() { return <RequireRole roles={['PHARMACIST']}><Settings /></RequireRole>; }
