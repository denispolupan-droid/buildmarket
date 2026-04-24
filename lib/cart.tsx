'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export type CartItem = {
  sku: string;
  name: string;
  brand: string;
  volume: string | null;
  price: number;
  qty: number;
  min_order: number;
  nl1: string;
  nl2?: string;
  bc: string;
  ac: string;
  img_type: 'tube' | 'canister';
};

type CartContext = {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
  addItem: (item: Omit<CartItem, 'qty'>, qty: number) => void;
  removeItem: (sku: string) => void;
  updateQty: (sku: string, qty: number) => void;
  clearCart: () => void;
};

const CartCtx = createContext<CartContext | null>(null);

const STORAGE_KEY = 'fixline_cart';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((item: Omit<CartItem, 'qty'>, qty: number) => {
    setItems(prev => {
      const existing = prev.find(i => i.sku === item.sku);
      if (existing) {
        return prev.map(i => i.sku === item.sku ? { ...i, qty: i.qty + qty } : i);
      }
      return [...prev, { ...item, qty }];
    });
  }, []);

  const removeItem = useCallback((sku: string) => {
    setItems(prev => prev.filter(i => i.sku !== sku));
  }, []);

  const updateQty = useCallback((sku: string, qty: number) => {
    setItems(prev => prev.map(i => i.sku === sku ? { ...i, qty: Math.max(i.min_order, qty) } : i));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartCtx.Provider value={{ items, totalItems, totalPrice, addItem, removeItem, updateQty, clearCart }}>
      {children}
    </CartCtx.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
