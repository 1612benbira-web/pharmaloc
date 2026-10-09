export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Obj = Record<string, any>;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

const KEY = 'pharmaloc.session';
export interface Session { accessToken: string; refreshToken: string; user: Obj }

export const session = {
  get(): Session | null {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
  },
  set(s: Session | null) {
    if (typeof window === 'undefined') return;
    if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event('pharmaloc:session'));
  },
};

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const s = session.get();
  if (!s) return false;
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) })
    .then(async (r) => { if (!r.ok) return false; session.set((await r.json()).data); return true; })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** Appel API : jeton ajouté automatiquement, rafraîchi une fois en cas d'expiration (401). */
export async function api<T = Obj>(path: string, init: Omit<RequestInit, 'body'> & { body?: unknown } = {}): Promise<T> {
  const call = () => {
    const token = session.get()?.accessToken;
    return fetch(`${API_URL}${path}`, {
      ...init,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
  };
  let res = await call();
  if (res.status === 401 && session.get() && !path.startsWith('/auth/') && (await refresh())) res = await call();
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error ?? {};
    if (res.status === 401 && session.get() && !path.startsWith('/auth/')) session.set(null);
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'Erreur réseau', e.details);
  }
  return json as T;
}

export const errMsg = (e: unknown) => {
  if (e instanceof ApiError) {
    const d = Array.isArray(e.details) ? ` (${e.details.map((x: Obj) => x.message ?? JSON.stringify(x)).join(' ; ')})` : '';
    return e.message + d;
  }
  return 'Impossible de joindre le serveur';
};
