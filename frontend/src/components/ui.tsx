'use client';
import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { api, errMsg } from '@/lib/api';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'danger' | 'ghost' }) {
  const v = { primary: 'bg-brand-600 text-white hover:bg-brand-700', outline: 'border border-brand-200 text-brand-800 hover:bg-brand-50', danger: 'bg-red-600 text-white hover:bg-red-700', ghost: 'text-brand-800 hover:bg-brand-50' }[variant];
  return <button {...p} className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed', v, className)} />;
}
export const Input = ({ label, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) => (
  <label className="block text-sm"><span className="mb-1 block font-medium text-ink/80">{label}</span>
    <input {...p} className={cn('w-full rounded-lg border border-brand-200 bg-white px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100', className)} /></label>
);
export const Select = ({ label, children, className, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) => (
  <label className="block text-sm"><span className="mb-1 block font-medium text-ink/80">{label}</span>
    <select {...p} className={cn('w-full rounded-lg border border-brand-200 bg-white px-3 py-2 outline-none focus:border-brand-500', className)}>{children}</select></label>
);
export const Card = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('rounded-2xl border border-brand-100 bg-white p-5 shadow-sm', className)}>{children}</div>;
export function Badge({ tone = 'gray', children }: { tone?: 'green' | 'amber' | 'red' | 'gray' | 'blue'; children: ReactNode }) {
  const t = { green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800', gray: 'bg-gray-100 text-gray-700', blue: 'bg-sky-100 text-sky-800' }[tone];
  return <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', t)}>{children}</span>;
}
export const Notice = ({ tone = 'error', children }: { tone?: 'error' | 'ok' | 'info'; children: ReactNode }) => (
  <div role="alert" className={cn('rounded-lg px-4 py-3 text-sm', tone === 'error' && 'bg-red-50 text-red-800', tone === 'ok' && 'bg-emerald-50 text-emerald-800', tone === 'info' && 'bg-sky-50 text-sky-800')}>{children}</div>
);
export const Page = ({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) => (
  <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold">{title}</h1>{subtitle && <p className="text-sm text-ink/60">{subtitle}</p>}</div>{actions}
    </div>{children}
  </main>
);
export const Stat = ({ label, value, tone }: { label: string; value: ReactNode; tone?: 'red' | 'amber' | 'green' }) => (
  <Card className="!p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink/50">{label}</p>
    <p className={cn('mt-1 text-2xl font-extrabold', tone === 'red' && 'text-red-600', tone === 'amber' && 'text-amber-600', tone === 'green' && 'text-brand-700')}>{value}</p></Card>
);

/** Chargement d'une ressource API avec rechargement manuel / périodique. */
export function useFetch<T = unknown>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    try { setData(((await api<{ data: T }>(path)) as { data: T }).data); setError(''); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { load(); if (pollMs) { const t = setInterval(load, pollMs); return () => clearInterval(t); } }, [load, pollMs]);
  return { data, error, loading, reload: load };
}

export function BarChart({ data, x, y, color = '#17806a', fmt = (n: number) => String(n) }: { data: Record<string, unknown>[]; x: string; y: string; color?: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => Number(d[y])));
  return (
    <div className="flex h-40 items-end gap-1" role="img" aria-label={`Graphique ${y}`}>
      {data.map((d, i) => (
        <div key={i} className="group flex h-full flex-1 flex-col items-center justify-end" title={`${String(d[x])} : ${fmt(Number(d[y]))}`}>
          <div className="w-full rounded-t" style={{ height: `${(Number(d[y]) / max) * 100}%`, minHeight: Number(d[y]) ? 3 : 0, background: color }} />
          <span className="mt-1 hidden text-[9px] text-ink/50 sm:block">{String(d[x]).slice(-5)}</span>
        </div>
      ))}
    </div>
  );
}
export function LineChart({ data, x, y, color = '#17806a' }: { data: Record<string, unknown>[]; x: string; y: string; color?: string }) {
  const vals = data.map((d) => Number(d[y]));
  const max = Math.max(1, ...vals), min = Math.min(...vals, 0);
  const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * 300},${96 - ((v - min) / (max - min || 1)) * 90}`).join(' ');
  return (
    <svg viewBox="0 0 300 110" className="h-40 w-full" role="img" aria-label={`Évolution ${y}`}>
      <polyline fill="none" stroke={color} strokeWidth="2.5" points={pts} />
      {vals.map((v, i) => <circle key={i} cx={(i / Math.max(1, vals.length - 1)) * 300} cy={96 - ((v - min) / (max - min || 1)) * 90} r="2.5" fill={color}><title>{`${String(data[i]?.[x])} : ${v}`}</title></circle>)}
      <text x="0" y="108" fontSize="8" fill="#888">{String(data[0]?.[x] ?? '').slice(-5)}</text><text x="300" y="108" fontSize="8" fill="#888" textAnchor="end">{String(data.at(-1)?.[x] ?? '').slice(-5)}</text>
    </svg>
  );
}
