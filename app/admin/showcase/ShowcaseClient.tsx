'use client';

import { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, Search, X } from 'lucide-react';
import { showToast } from '../../../lib/toast';
// Тільки чисті функції й типи: lib/showcase тягне supabase у серверній частині,
// але вона під динамічним import() — у клієнтський бандл не потрапляє.
import {
  moveShowcaseItem, SHOWCASE_LIMIT, SHOWCASE_MAX_ITEMS, type ShowcaseSurface,
} from '../../../lib/showcase';

type Item = {
  sku: string; name: string; brand: string | null; volume: string | null;
  image: string | null; price: number | null; stockStatus: string | null;
  isActive: boolean; visible: boolean; overLimit: boolean;
};
type Found = { sku: string; name: string; brand: string | null; volume: string | null };

const SURFACES: { key: ShowcaseSurface; label: string; hint: string }[] = [
  { key: 'shop',    label: 'Магазин', hint: 'Роздрібна вітрина — /shop' },
  { key: 'catalog', label: 'Каталог', hint: 'Оптова вітрина — /catalog, під авторизацією' },
];

export default function ShowcaseClient({ canEdit }: { canEdit: boolean }) {
  const [surface, setSurface] = useState<ShowcaseSurface>('shop');
  const [items, setItems]     = useState<Record<ShowcaseSurface, Item[]>>({ shop: [], catalog: [] });
  const [order, setOrder]     = useState<Record<ShowcaseSurface, string[]>>({ shop: [], catalog: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');
  const [found, setFound]     = useState<Found[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch('/api/admin/showcase').then(r => r.json());
      setItems({ shop: d.shop ?? [], catalog: d.catalog ?? [] });
      setOrder({
        shop:    (d.shop ?? []).map((i: Item) => i.sku),
        catalog: (d.catalog ?? []).map((i: Item) => i.sku),
      });
    } catch {
      showToast('Не вдалося завантажити вітрину', 'error');
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (search.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await fetch(`/api/admin/products/search?q=${encodeURIComponent(search.trim())}`).then(r => r.json());
        setFound(Array.isArray(d) ? d : []);
      } catch { setFound([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const cur = order[surface];
  const byId = new Map(items[surface].map(i => [i.sku, i]));
  const dirty = cur.join(',') !== items[surface].map(i => i.sku).join(',');

  function setCur(next: string[]) { setOrder(o => ({ ...o, [surface]: next })); }

  function add(sku: string) {
    if (cur.includes(sku)) return;
    if (cur.length >= SHOWCASE_MAX_ITEMS) { showToast(`Максимум ${SHOWCASE_MAX_ITEMS} позицій`, 'error'); return; }
    setCur([...cur, sku]);
    setSearch(''); setFound([]);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/showcase', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface, skus: cur }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error ?? 'Помилка збереження', 'error'); return; }
      setItems(s => ({ ...s, [surface]: d.items ?? [] }));
      setOrder(o => ({ ...o, [surface]: (d.items ?? []).map((i: Item) => i.sku) }));
      showToast('Вітрину збережено', 'success');
    } catch {
      showToast('Помилка мережі', 'error');
    } finally { setSaving(false); }
  }

  const shownCount = cur.filter(sku => byId.get(sku)?.visible !== false).slice(0, SHOWCASE_LIMIT).length;

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <LayoutGrid size={20} color="#1E3A5F" />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>Вітрина</h1>
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 640 }}>
        Товари, які показуються першим рядом на головній. Перші <b>{SHOWCASE_LIMIT}</b> придатних —
        це два ряди по чотири; решта лежить у запасі й підстрахує, коли щось закінчиться.
        Товар без наявності або деактивований покупцю не показується, але зі списку не зникає.
      </p>

      {/* Вкладки вітрин */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {SURFACES.map(s => {
          const active = s.key === surface;
          return (
            <button key={s.key} onClick={() => setSurface(s.key)} title={s.hint}
              style={{
                padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${active ? '#1E3A5F' : 'var(--border)'}`,
                background: active ? '#1E3A5F' : 'var(--bg-card)',
                color: active ? '#fff' : 'var(--text-secondary)',
              }}>
              {s.label}
              <span style={{ marginLeft: 8, fontWeight: 500, opacity: 0.75 }}>{order[s.key].length}</span>
            </button>
          );
        })}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          {SURFACES.find(s => s.key === surface)!.hint} · зараз покупець побачить <b>{shownCount}</b> із {cur.length}
        </div>

        {loading ? (
          <div style={{ padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>Завантаження…</div>
        ) : cur.length === 0 ? (
          <div style={{ padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Вітрина порожня — знайдіть товар нижче й додайте.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {cur.map((sku, i) => {
              const it = byId.get(sku);
              const over = i >= SHOWCASE_LIMIT;
              const hidden = it && !it.visible;
              return (
                <div key={sku} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                  background: over ? 'var(--bg-soft)' : undefined,
                  opacity: hidden ? 0.55 : 1,
                  borderTop: i > 0 ? '1px solid var(--border-light)' : 'none',
                }}>
                  <span style={{ width: 22, fontSize: 12, fontWeight: 700, color: over ? 'var(--text-muted)' : '#1E3A5F' }}>
                    {i + 1}.
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it ? `${it.brand ? it.brand + ' ' : ''}${it.name}` : sku}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      <span style={{ fontFamily: 'monospace' }}>{sku}</span>
                      {it?.price ? ` · ${it.price} грн` : ''}
                      {hidden && (
                        <span style={{ color: '#B45309', fontWeight: 600 }}>
                          {' · '}{!it?.isActive ? 'деактивований' : 'немає в наявності'} — не показується
                        </span>
                      )}
                      {over && <span style={{ color: 'var(--text-muted)' }}>{' · '}у запасі, понад {SHOWCASE_LIMIT}</span>}
                    </div>
                  </div>
                  {canEdit && (
                    <>
                      <button onClick={() => setCur(moveShowcaseItem(cur, i, -1))} disabled={i === 0} style={miniBtn} title="Вище">↑</button>
                      <button onClick={() => setCur(moveShowcaseItem(cur, i, 1))} disabled={i === cur.length - 1} style={miniBtn} title="Нижче">↓</button>
                      <button onClick={() => setCur(cur.filter(x => x !== sku))} style={{ ...miniBtn, color: '#DC2626' }} title="Прибрати">
                        <X size={13} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canEdit && (
          <>
            <div style={{ position: 'relative', marginTop: 14 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-muted)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Додати товар: назва, бренд або SKU"
                style={{ width: '100%', height: 38, padding: '0 12px 0 30px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', background: 'var(--bg-soft)', color: 'var(--text-primary)' }} />
              {found.length > 0 && (
                <div style={{ marginTop: 4, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)' }}>
                  {found.map(f => {
                    const already = cur.includes(f.sku);
                    return (
                      <button key={f.sku} disabled={already} onClick={() => add(f.sku)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                          border: 'none', borderBottom: '1px solid var(--border-light)', background: 'none',
                          fontSize: 12.5, color: already ? 'var(--text-muted)' : 'var(--text-primary)',
                          cursor: already ? 'default' : 'pointer',
                        }}>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{f.sku}</span>{' '}
                        {f.brand ? `${f.brand} ` : ''}{f.name}{f.volume ? ` — ${f.volume}` : ''}
                        {already && ' — уже у вітрині'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <button onClick={save} disabled={saving || !dirty}
                style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: '#1E3A5F', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving || !dirty ? 'default' : 'pointer', opacity: saving || !dirty ? 0.5 : 1 }}>
                {saving ? 'Зберігаю…' : 'Зберегти вітрину'}
              </button>
              {dirty && (
                <button onClick={() => setCur(items[surface].map(i => i.sku))}
                  style={{ height: 36, padding: '0 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Скасувати зміни
                </button>
              )}
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {dirty ? 'є незбережені зміни' : 'збережено'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)',
  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, flexShrink: 0,
};
