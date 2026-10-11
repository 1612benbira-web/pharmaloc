'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { createMapController, type MapController, type MapMarker } from '@/lib/leafletMap';

export interface MapProps {
  markers: MapMarker[];
  /** Tracé entre points (ex. pharmacie → client). */
  line?: [number, number][];
  height?: number;
  /** Si fourni, un clic sur la carte (ou le déplacement d'un repère `draggable`) appelle cette fonction. */
  onPick?: (lat: number, lng: number) => void;
  /** Le cadrage automatique n'est refait que lorsque cette clé change (évite que la carte « saute »). */
  fitKey?: string;
}

export default function MapInner({ markers, line, height = 320, onPick, fitKey = 'init' }: MapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ctl = useRef<MapController | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const c = createMapController(ref.current!, { onPick: pick.current ? (la, ln) => pick.current?.(la, ln) : undefined });
    ctl.current = c;
    return () => { c.destroy(); ctl.current = null; };
  }, []);
  useEffect(() => { ctl.current?.setMarkers(markers); ctl.current?.setLine(line ?? []); }, [markers, line]);
  useEffect(() => { ctl.current?.fit(); }, [fitKey]);

  // isolate : la carte ne passe jamais au-dessus de l'en-tête collant
  return <div ref={ref} style={{ height }} className="relative isolate z-0 w-full overflow-hidden rounded-xl border border-brand-100" role="application" aria-label="Carte" />;
}
