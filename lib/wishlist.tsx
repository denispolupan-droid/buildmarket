'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

const LS_KEY = 'fixline_wishlist';

type WishlistContext = {
  skus: Set<string>;
  toggle: (sku: string) => void;
  isLiked: (sku: string) => boolean;
  cleanSkus: (validSkus: string[]) => void;
  loaded: boolean;
};

const WishlistCtx = createContext<WishlistContext | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [skus, setSkus] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Load from localStorage immediately (works for guests)
    const local = localStorage.getItem(LS_KEY);
    const localSet: Set<string> = local ? new Set(JSON.parse(local)) : new Set();

    // Then try syncing with server (logged-in users)
    fetch('/api/wishlist')
      .then(r => r.ok ? r.json() : { skus: [] })
      .then(data => {
        const serverSkus: string[] = data.skus ?? [];
        if (serverSkus.length > 0) {
          // Merge server + local
          const merged = new Set([...localSet, ...serverSkus]);
          setSkus(merged);
          localStorage.setItem(LS_KEY, JSON.stringify([...merged]));
        } else {
          setSkus(localSet);
        }
        setLoaded(true);
      })
      .catch(() => {
        setSkus(localSet);
        setLoaded(true);
      });
  }, []);

  const toggle = useCallback((sku: string) => {
    setSkus(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      return next;
    });
    // Try server sync (silently fails for guests)
    fetch('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku }),
    }).catch(() => {});
  }, []);

  const isLiked = useCallback((sku: string) => skus.has(sku), [skus]);

  const cleanSkus = useCallback((validSkus: string[]) => {
    const valid = new Set(validSkus);
    setSkus(prev => {
      const next = new Set([...prev].filter(s => valid.has(s)));
      localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return (
    <WishlistCtx.Provider value={{ skus, toggle, isLiked, cleanSkus, loaded }}>
      {children}
    </WishlistCtx.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistCtx);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
