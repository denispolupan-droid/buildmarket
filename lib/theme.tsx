'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

type Theme = 'light' | 'dark';
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });

/** Ключ localStorage для теми адмінки. Сайт — завжди світлий (див. нижче). */
export const ADMIN_THEME_KEY = 'admin_theme';
const isAdminPath = (p: string | null) => !!p && (p === '/admin' || p.startsWith('/admin/'));

/** Яка тема має бути на цьому шляху: адмінка — збережена менеджером, сайт — світла. */
function desiredTheme(pathname: string | null): Theme {
  if (!isAdminPath(pathname)) return 'light';
  try { return localStorage.getItem(ADMIN_THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

function apply(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
}

/**
 * Сайт: темна тема вимкнена — перемикача в публічному UI немає, а автопідхоплення
 * prefers-color-scheme робило сайт темним у вебв'ю месенджерів без способу повернутись.
 * Збережений колись 'theme' прибираємо.
 * Адмінка (рішення власника 08.11.2026): менеджер обирає тему сам, вона живе окремим
 * ключем admin_theme і діє лише на /admin/*; при переході на сайт — знову світла.
 * Той самий вибір до першого кадру ставить blocking-скрипт у app/layout.tsx.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    try { localStorage.removeItem('theme'); } catch {}
    const next = desiredTheme(pathname);
    setTheme(next);
    apply(next);
  }, [pathname]);

  function toggle() {
    if (!isAdminPath(pathname)) return; // на сайті перемикача немає
    setTheme(prev => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(ADMIN_THEME_KEY, next); } catch {}
      apply(next);
      return next;
    });
  }

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() { return useContext(ThemeCtx); }
