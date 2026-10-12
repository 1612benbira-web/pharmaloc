'use client';
import { useEffect, useState } from 'react';
import { Button, Card, Input, Notice, Page, useFetch } from '@/components/ui';
import { api, errMsg, type Obj } from '@/lib/api';
import { RequireRole, useAuth } from '@/lib/auth';
import { fcfa, openLabel } from '@/lib/format';

/** Même formule que le serveur (modules/pharmacies/deliveryFee.ts) : sert uniquement à l'aperçu. */
const fee = (p: { base: number; perKm: number; included: number }, km: number) =>
  Math.ceil((p.base + p.perKm * Math.max(0, km - p.included)) / 50 - 1e-9) * 50 || 0;

// Ordre d'affichage lundi -> dimanche ; `day` suit la convention serveur (0 = dimanche)
const DAYS: { day: number; name: string }[] = [
  { day: 1, name: 'Lundi' }, { day: 2, name: 'Mardi' }, { day: 3, name: 'Mercredi' }, { day: 4, name: 'Jeudi' },
  { day: 5, name: 'Vendredi' }, { day: 6, name: 'Samedi' }, { day: 0, name: 'Dimanche' },
];
type Day = { open: boolean; from: string; to: string };
const defaultWeek = (): Record<number, Day> =>
  Object.fromEntries(DAYS.map(({ day }) => [day, { open: day !== 0, from: '08:00', to: '20:00' }]));

function Settings() {
  const { user } = useAuth();
  const { data, error, reload } = useFetch<Obj>(user?.pharmacyId ? `/pharmacies/${user.pharmacyId}` : null);
  const [f, setF] = useState({ phone: '', base: '500', perKm: '150', included: '1', radius: '10', offersDelivery: true, offersPickup: true, is24h: false });
  const [week, setWeek] = useState<Record<number, Day>>(defaultWeek());
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setF({
      phone: data.phone ?? '', base: String(data.deliveryFee ?? 0), perKm: String(data.deliveryPerKmFee ?? 0), included: String(data.deliveryIncludedKm ?? 0),
      radius: String(data.deliveryRadiusKm ?? 10), offersDelivery: !!data.offersDelivery, offersPickup: !!data.offersPickup, is24h: !!data.is24h,
    });
    if (data.openingHours?.length) {
      const w = defaultWeek();
      for (const { day } of DAYS) w[day] = { open: false, from: '08:00', to: '20:00' }; // jour absent = fermé
      for (const h of data.openingHours as Obj[]) w[h.day] = { open: !h.closed && !!h.open, from: h.open ?? '08:00', to: h.close ?? '20:00' };
      setWeek(w);
    }
  }, [data]);

  const setDay = (day: number, patch: Partial<Day>) => setWeek({ ...week, [day]: { ...week[day]!, ...patch } });
  const copyMonday = () => setWeek(Object.fromEntries(DAYS.map(({ day }) => [day, day === 1 ? week[1]! : { ...week[1]!, open: week[day]!.open }])));
  const tariff = { base: Number(f.base) || 0, perKm: Number(f.perKm) || 0, included: Number(f.included) || 0 };
  const badDay = !f.is24h && DAYS.find(({ day }) => week[day]!.open && week[day]!.from === week[day]!.to);
  const openDays = DAYS.filter(({ day }) => week[day]!.open).length;

  const save = async () => {
    try {
      await api(`/pharmacies/${user!.pharmacyId}`, { method: 'PATCH', body: {
        ...(f.phone && { phone: f.phone }), deliveryFee: Number(f.base), deliveryPerKmFee: Number(f.perKm), deliveryIncludedKm: Number(f.included), deliveryRadiusKm: Number(f.radius),
        offersDelivery: f.offersDelivery, offersPickup: f.offersPickup, is24h: f.is24h,
        openingHours: DAYS.map(({ day }) => (week[day]!.open ? { day, open: week[day]!.from, close: week[day]!.to } : { day, closed: true })),
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
          <h2 className="font-semibold">Jours et horaires d’ouverture</h2>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={f.is24h} onChange={(e) => setF({ ...f, is24h: e.target.checked })} />Ouverte 24 h / 24, 7 jours sur 7</label>
          <div className={`space-y-2 ${f.is24h ? 'pointer-events-none opacity-40' : ''}`}>
            {DAYS.map(({ day, name }) => {
              const d = week[day]!;
              return (
                <div key={day} className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-100 px-3 py-2">
                  <label className="flex w-36 items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={d.open} onChange={(e) => setDay(day, { open: e.target.checked })} />{name}</label>
                  {d.open ? (
                    <>
                      <input type="time" aria-label={`${name} : ouverture`} value={d.from} onChange={(e) => setDay(day, { from: e.target.value })} className="rounded-lg border border-brand-200 px-2 py-1 text-sm" />
                      <span className="text-ink/50">→</span>
                      <input type="time" aria-label={`${name} : fermeture`} value={d.to} onChange={(e) => setDay(day, { to: e.target.value })} className="rounded-lg border border-brand-200 px-2 py-1 text-sm" />
                      {d.to < d.from && <span className="text-xs text-ink/50">ferme après minuit</span>}
                      {d.to === d.from && <span className="text-xs text-red-700">heures identiques</span>}
                    </>
                  ) : <span className="text-sm text-ink/50">Fermée</span>}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={copyMonday} disabled={f.is24h}>Copier les heures du lundi sur les jours ouverts</Button>
            <span className="text-xs text-ink/50">{f.is24h ? '24 h/24' : `${openDays} jour(s) ouvert(s) par semaine`}</span>
          </div>
          {badDay && <Notice>{badDay.name} : l’heure de fermeture doit être différente de l’ouverture.</Notice>}
          {data && <p className="text-sm text-ink/70">Statut actuel : <b>{openLabel(data.openStatus, data.isOpen)}</b> <span className="text-xs">(heure de Dakar)</span></p>}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="font-semibold">Services</h2>
            <Input label="Téléphone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600" checked={f.offersDelivery} onChange={(e) => setF({ ...f, offersDelivery: e.target.checked })} />Livraison</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-600" checked={f.offersPickup} onChange={(e) => setF({ ...f, offersPickup: e.target.checked })} />Retrait</label>
            </div>
          </Card>
          <Card className="space-y-3">
            <h2 className="font-semibold">Tarif de livraison</h2>
            <p className="text-sm text-ink/60">Frais = <b>base</b> + <b>prix par km</b> × (distance − km inclus), arrondi aux 50 FCFA. Distance à vol d’oiseau entre votre pharmacie et l’adresse du patient.</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Frais de base (FCFA)" type="number" min="0" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} />
              <Input label="Prix par km (FCFA)" type="number" min="0" value={f.perKm} onChange={(e) => setF({ ...f, perKm: e.target.value })} />
              <Input label="Km inclus dans la base" type="number" min="0" step="0.5" value={f.included} onChange={(e) => setF({ ...f, included: e.target.value })} />
              <Input label="Rayon maximum (km)" type="number" min="0" value={f.radius} onChange={(e) => setF({ ...f, radius: e.target.value })} />
            </div>
            <div className="rounded-xl bg-brand-50 p-3 text-sm"><p className="mb-1 font-medium">Aperçu pour le patient</p>
              <div className="flex flex-wrap gap-2">{[1, 2, 3, 5, 8].filter((km) => km <= Number(f.radius || 0)).map((km) => <span key={km} className="rounded-lg bg-white px-3 py-1">{km} km : <b>{fcfa(fee(tariff, km))}</b></span>)}</div></div>
          </Card>
        </div>
      </div>
      <div className="mt-4"><Button onClick={save} disabled={!!badDay}>Enregistrer tous les paramètres</Button></div>
    </Page>
  );
}
export default function P() { return <RequireRole roles={['PHARMACIST']}><Settings /></RequireRole>; }
