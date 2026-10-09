'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface CartLine { medicineId: string; name: string; price: number; quantity: number; max: number; prescription?: boolean }
export interface CartState { pharmacyId: string | null; pharmacyName: string; deliveryFee: number; offersDelivery: boolean; lines: CartLine[] }
const empty: CartState = { pharmacyId: null, pharmacyName: '', deliveryFee: 0, offersDelivery: true, lines: [] };
interface Ctx { cart: CartState; add(p: { id: string; name: string; fee: number; delivery: boolean }, l: CartLine): void; setQty(id: string, q: number): void; clear(): void; count: number }
const CartCtx = createContext<Ctx>(null as never);
export const useCart = () => useContext(CartCtx);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>(empty);
  useEffect(() => { try { setCart(JSON.parse(localStorage.getItem('pharmaloc.cart') ?? '') as CartState); } catch { /* vide */ } }, []);
  const save = (c: CartState) => { setCart(c); localStorage.setItem('pharmaloc.cart', JSON.stringify(c)); };
  const add: Ctx['add'] = (p, l) => {
    // un panier = une seule pharmacie
    const base = cart.pharmacyId === p.id ? cart : { ...empty, pharmacyId: p.id, pharmacyName: p.name, deliveryFee: p.fee, offersDelivery: p.delivery };
    const found = base.lines.find((x) => x.medicineId === l.medicineId);
    const lines = found ? base.lines.map((x) => (x === found ? { ...x, quantity: Math.min(x.max, x.quantity + l.quantity) } : x)) : [...base.lines, l];
    save({ ...base, lines });
  };
  const setQty = (id: string, q: number) => save({ ...cart, lines: cart.lines.map((l) => (l.medicineId === id ? { ...l, quantity: Math.max(1, Math.min(l.max, q)) } : l)).filter((l) => l.quantity > 0) });
  const clear = () => save(empty);
  return <CartCtx.Provider value={{ cart, add, setQty, clear, count: cart.lines.reduce((s, l) => s + l.quantity, 0) }}>{children}</CartCtx.Provider>;
}
