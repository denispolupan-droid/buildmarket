'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShoppingBag, Package, Users, CornerDownLeft } from 'lucide-react';
import { PAGES } from './admin-nav';
import { STATUSES } from '../../admin/_orders/constants';
import { fmtMoney } from '../../../lib/format';

/**
 * Палітра команд адмінки (Ctrl+K / ⌘K): сторінки й вкладки — одразу, замовлення,
 * товари й контрагенти — через /api/admin/search. Нативний <dialog> у верхньому
 * шарі, як Modal; відкривається з сайдбара або з клавіатури на будь-якій сторінці.
 */
type SearchResult = {
  orders:    { id: string; order_number: string | number; contact: string | null; company: string | null; status: string; total_price: number | null }[];
  products:  { sku: string; name: string; brand: string | null }[];
  customers: { id: string; name: string | null; company: string | null; phone: string | null; type: string | null }[];
};
type Row = { key: string; href: string; group: string; title: string; hint?: string; icon: React.ComponentType<{ size?: number }> };

const EMPTY: SearchResult = { orders: [], products: [], customers: [] };
const STATUS_LABEL = new Map(STATUSES.map(s => [s.value, s.label]));

function norm(s: string) { return s.toLowerCase().replace(/ё/g, 'е').replace(/і/g, 'и'); }

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <PaletteDialog onClose={onClose} />;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    inputRef.current?.focus();
    return () => { if (dlg.open) dlg.close(); };
  }, []);

  // Перейшли на сторінку — палітра більше не потрібна
  const firstPath = useRef(pathname);
  useEffect(() => { if (pathname !== firstPath.current) closeRef.current(); }, [pathname]);

  // Віддалений пошук — з паузою, щоб не бити API на кожну літеру
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRemote(EMPTY); setLoading(false); return; }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() : EMPTY)
        .then((d: SearchResult) => { setRemote({ ...EMPTY, ...d }); setLoading(false); })
        .catch(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const rows = useMemo<Row[]>(() => {
    const term = norm(q.trim());
    const pages = (term
      ? PAGES.filter(p => norm(p.label).includes(term) || norm(p.section).includes(term))
      : PAGES.filter(p => !p.label.includes(' · '))
    ).slice(0, term ? 8 : 20)
      .map(p => ({ key: `p:${p.href}`, href: p.href, group: 'Сторінки', title: p.label, hint: p.section, icon: p.icon }));

    const orders = remote.orders.map(o => ({
      key: `o:${o.id}`,
      // q — щоб рядок точно був на сторінці журналу, expand — щоб одразу розгорнувся
      href: `/admin?status=&q=${encodeURIComponent(String(o.order_number))}&expand=${o.id}`,
      group: 'Замовлення',
      title: `№${o.order_number} — ${o.contact || o.company || 'без імені'}`,
      hint: [STATUS_LABEL.get(o.status) ?? o.status, o.total_price != null ? `${fmtMoney(Number(o.total_price))} ₴` : ''].filter(Boolean).join(' · '),
      icon: ShoppingBag,
    }));
    const products = remote.products.map(p => ({
      key: `s:${p.sku}`, href: `/admin/products/${encodeURIComponent(p.sku)}`, group: 'Товари',
      title: p.name, hint: [p.sku, p.brand].filter(Boolean).join(' · '), icon: Package,
    }));
    const customers = remote.customers.map(c => ({
      key: `c:${c.id}`, href: `/admin/partners?open=${c.id}`, group: 'Контрагенти',
      title: c.company || c.name || '—', hint: [c.company ? c.name : null, c.phone].filter(Boolean).join(' · '), icon: Users,
    }));
    return [...orders, ...customers, ...products, ...pages];
  }, [q, remote]);

  useEffect(() => { setCursor(0); }, [rows.length, q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function go(row: Row) { closeRef.current(); router.push(row.href); }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows[cursor]; if (r) go(r); }
  }

  let lastGroup = '';
  return (
    <dialog
      ref={ref}
      className="ui-modal ui-palette"
      aria-label="Пошук по адмінці"
      onCancel={e => { e.preventDefault(); closeRef.current(); }}
      onClick={e => { if (e.target === e.currentTarget) closeRef.current(); }}
    >
      <div className="ui-palette-input-wrap">
        <input
          ref={inputRef}
          className="ui-palette-input"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Сторінка, № замовлення, телефон, товар…"
          aria-label="Пошук"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="ui-palette-kbd">Esc</kbd>
      </div>
      <div className="ui-palette-list" ref={listRef} role="listbox">
        {rows.length === 0 && (
          <div className="ui-palette-empty">{loading ? 'Шукаю…' : q.trim().length >= 2 ? 'Нічого не знайдено' : 'Почніть вводити'}</div>
        )}
        {rows.map((r, i) => {
          const Icon = r.icon;
          const head = r.group !== lastGroup ? r.group : null;
          lastGroup = r.group;
          return (
            <div key={r.key}>
              {head && <div className="ui-palette-group">{head}{head !== 'Сторінки' && loading && i === 0 ? ' · оновлюю…' : ''}</div>}
              <button
                type="button"
                role="option"
                aria-selected={i === cursor}
                data-idx={i}
                className={`ui-palette-row${i === cursor ? ' is-active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(r)}
              >
                <Icon size={15} />
                <span className="ui-palette-title">{r.title}</span>
                {r.hint && <span className="ui-palette-hint">{r.hint}</span>}
                {i === cursor && <CornerDownLeft size={13} className="ui-palette-enter" />}
              </button>
            </div>
          );
        })}
      </div>
    </dialog>
  );
}
