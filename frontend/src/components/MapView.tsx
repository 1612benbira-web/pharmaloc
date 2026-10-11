'use client';
import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Button } from './ui';

export type { MapMarker } from '@/lib/leafletMap';
export const MapView = dynamic(() => import('./MapInner'), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-xl bg-brand-50" /> });

/**
 * Affiche la carte uniquement après un clic : aucune tuile n'est téléchargée tant que l'utilisateur ne le demande pas
 * (respect de la politique OSM contre le chargement inutile, et protection de la vie privée).
 */
export function LazyMap({ label = 'Voir la carte', hint, children }: { label?: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={() => setOpen(!open)}>{open ? '✕ Masquer la carte' : `🗺 ${label}`}</Button>
      {open && (
        <>
          {hint && <p className="text-xs text-ink/60">{hint}</p>}
          {children}
          <p className="text-[11px] text-ink/45">Fond de carte fourni par OpenStreetMap : en affichant la carte, votre navigateur télécharge des tuiles depuis leurs serveurs, qui voient votre adresse IP et la zone consultée.</p>
        </>
      )}
    </div>
  );
}
