'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Eye, EyeOff, Flame, Sparkles, Store, FolderInput, Tag, Percent, Trash2, X } from 'lucide-react';
import type { Category } from '../../../types';

type Props = {
  skus: string[];
  categories: Category[];
  brands: string[];
  /** Викликається після успішної операції — зняти вибір і перечитати список */
  onDone: () => void;
};

type PromptKind = 'category' | 'brand' | 'prom_markup_pct' | 'rozetka_markup_pct' | 'delete';

type Blocked = { sku: string; reason: string };

const itemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
  padding: '9px 14px', border: 'none', background: 'transparent',
  color: 'var(--text-primary)', fontSize: 13, textAlign: 'left', cursor: 'pointer',
};

const groupLabelStyle: React.CSSProperties = {
  padding: '10px 14px 4px', fontSize: 11, fontWeight: 700,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function BulkActionsMenu({ skus, categories, brands, onDone }: Props) {
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptKind | null>(null);
  const [value, setValue]   = useState('');
  const [report, setReport] = useState<{ deleted: number; blocked: Blocked[] } | null>(null);

  const n = skus.length;

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus, ...payload }),
      });
      const json = await res.json() as { error?: string; deleted?: number; blocked?: Blocked[] };
      if (!res.ok) { setError(json.error ?? 'Помилка'); return; }

      // Частина товарів могла не видалитись через облікову історію — не закриваємо
      // вікно мовчки, а показуємо список із причинами.
      if (json.blocked?.length) {
        setReport({ deleted: json.deleted ?? 0, blocked: json.blocked });
        router.refresh();
        return;
      }

      setPrompt(null);
      setOpen(false);
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка мережі');
    } finally {
      setBusy(false);
    }
  }

  function closeReport() {
    setReport(null);
    setPrompt(null);
    setOpen(false);
    onDone();
  }

  const patch = (p: Record<string, unknown>) => send({ patch: p });

  function openPrompt(kind: PromptKind) {
    setValue(kind === 'category' ? (categories[0]?.slug ?? '') : '');
    setError(null);
    setPrompt(kind);
    setOpen(false);
  }

  function submitPrompt() {
    if (prompt === 'delete')   return send({ action: 'delete' });
    if (prompt === 'category') return patch({ category_slug: value });
    if (prompt === 'brand')    return patch({ brand: value.trim() });
    // Порожнє поле націнки = скинути на націнку категорії (null)
    return patch({ [prompt as string]: value.trim() === '' ? null : Number(value) });
  }

  const promptTitle: Record<PromptKind, string> = {
    category:           `Перенести ${n} товарів у категорію`,
    brand:              `Змінити бренд у ${n} товарів`,
    prom_markup_pct:    `Націнка Prom для ${n} товарів`,
    rozetka_markup_pct: `Націнка Rozetka для ${n} товарів`,
    delete:             `Видалити ${n} товарів?`,
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(o => !o); setError(null); }}
        style={{
          height: 34, padding: '0 14px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-card)',
          color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        Дії ({n}) <ChevronDown size={14} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute', top: 40, right: 0, zIndex: 41, width: 280,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
              padding: '4px 0', maxHeight: '70vh', overflowY: 'auto',
            }}
          >
            <div style={groupLabelStyle}>Видимість на сайті</div>
            <button style={itemStyle} disabled={busy} onClick={() => patch({ is_active: true })}>
              <Eye size={15} color="#22C55E" /> Активувати
            </button>
            <button style={itemStyle} disabled={busy} onClick={() => patch({ is_active: false })}>
              <EyeOff size={15} color="#94A3B8" /> Деактивувати
            </button>

            <div style={groupLabelStyle}>Позначки</div>
            <button style={itemStyle} disabled={busy} onClick={() => patch({ is_hit: true })}>
              <Flame size={15} color="#F97316" /> Позначити «Хіт»
            </button>
            <button style={itemStyle} disabled={busy} onClick={() => patch({ is_hit: false })}>
              <Flame size={15} color="#CBD5E1" /> Зняти «Хіт»
            </button>
            <button style={itemStyle} disabled={busy} onClick={() => patch({ is_new: true })}>
              <Sparkles size={15} color="#7C3AED" /> Позначити «Новинка»
            </button>
            <button style={itemStyle} disabled={busy} onClick={() => patch({ is_new: false })}>
              <Sparkles size={15} color="#CBD5E1" /> Зняти «Новинка»
            </button>

            <div style={groupLabelStyle}>Маркетплейси</div>
            <button style={itemStyle} disabled={busy} onClick={() => patch({ on_prom: true })}>
              <Store size={15} color="#3DBFB8" /> Вивантажувати на Prom
            </button>
            <button style={itemStyle} disabled={busy} onClick={() => patch({ on_prom: false })}>
              <Store size={15} color="#CBD5E1" /> Прибрати з Prom
            </button>
            <button style={itemStyle} disabled={busy} onClick={() => patch({ on_rozetka: true })}>
              <Store size={15} color="#3DBFB8" /> Вивантажувати на Rozetka
            </button>
            <button style={itemStyle} disabled={busy} onClick={() => patch({ on_rozetka: false })}>
              <Store size={15} color="#CBD5E1" /> Прибрати з Rozetka
            </button>
            <div style={{ padding: '2px 14px 8px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Прибраний товар лишається у фіді як «немає в наявності» — маркетплейс сам
              деактивує картку.
            </div>

            <div style={groupLabelStyle}>Змінити</div>
            <button style={itemStyle} disabled={busy} onClick={() => openPrompt('category')}>
              <FolderInput size={15} color="#64748B" /> Перенести в категорію…
            </button>
            <button style={itemStyle} disabled={busy} onClick={() => openPrompt('brand')}>
              <Tag size={15} color="#64748B" /> Змінити бренд…
            </button>
            <button style={itemStyle} disabled={busy} onClick={() => openPrompt('prom_markup_pct')}>
              <Percent size={15} color="#64748B" /> Націнка Prom…
            </button>
            <button style={itemStyle} disabled={busy} onClick={() => openPrompt('rozetka_markup_pct')}>
              <Percent size={15} color="#64748B" /> Націнка Rozetka…
            </button>

            <div style={{ borderTop: '1px solid var(--border-light)', margin: '6px 0 2px' }} />
            <button
              style={{ ...itemStyle, color: '#DC2626' }}
              disabled={busy}
              onClick={() => openPrompt('delete')}
            >
              <Trash2 size={15} /> Видалити {n} товарів…
            </button>
          </div>
        </>
      )}

      {error && !prompt && (
        <div style={{
          position: 'absolute', top: 40, right: 0, zIndex: 42, width: 280,
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
          borderRadius: 8, padding: '10px 12px', fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {report && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeReport(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div className="adm-modal-box" style={{
            background: 'var(--bg-card)', borderRadius: 14, width: 480, maxWidth: '100%',
            padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              {report.deleted > 0 ? `Видалено ${report.deleted}, залишилось ${report.blocked.length}` : 'Жоден товар не видалено'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
              Ці товари вже мають облікову історію, тож їх не можна видалити без
              спотворення звітів. Замість видалення — <b>деактивуйте</b> їх: товар
              зникне з сайту й фідів, а документи лишаться цілими.
            </div>
            <div style={{
              maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)',
              borderRadius: 9, padding: '4px 0',
            }}>
              {report.blocked.map(b => (
                <div key={b.sku} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  padding: '7px 12px', fontSize: 12, borderBottom: '1px solid var(--border-light)',
                }}>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{b.sku}</span>
                  <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{b.reason}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button
                onClick={closeReport}
                style={{
                  height: 38, padding: '0 18px', borderRadius: 9, border: 'none',
                  background: '#1E3A5F', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Зрозуміло
              </button>
            </div>
          </div>
        </div>
      )}

      {prompt && !report && (
        <div
          onClick={e => { if (e.target === e.currentTarget && !busy) setPrompt(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div className="adm-modal-box" style={{
            background: 'var(--bg-card)', borderRadius: 14, width: 420, maxWidth: '100%',
            padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: prompt === 'delete' ? '#DC2626' : 'var(--text-primary)' }}>
                {promptTitle[prompt]}
              </div>
              <button
                onClick={() => setPrompt(null)}
                disabled={busy}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {prompt === 'category' && (
              <select
                value={value}
                onChange={e => setValue(e.target.value)}
                style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14 }}
              >
                {categories.map(c => (
                  <option key={c.slug} value={c.slug}>
                    {c.parent_slug ? `— ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            )}

            {prompt === 'brand' && (
              <>
                <input
                  list="bulk-brands"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="Назва бренду"
                  style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14 }}
                />
                <datalist id="bulk-brands">
                  {brands.map(b => <option key={b} value={b} />)}
                </datalist>
              </>
            )}

            {(prompt === 'prom_markup_pct' || prompt === 'rozetka_markup_pct') && (
              <>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="напр. 12"
                  style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14 }}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                  Порожнє поле — скинути індивідуальну націнку, товар рахуватиметься
                  за націнкою категорії.
                </div>
              </>
            )}

            {prompt === 'delete' && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Разом з товарами будуть видалені їхні характеристики, ціни/залишки,
                прив&apos;язки до прайсів постачальників і відгуки. Дію не можна скасувати.
              </div>
            )}

            {error && (
              <div style={{ marginTop: 12, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 8, padding: '9px 12px', fontSize: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button
                onClick={() => setPrompt(null)}
                disabled={busy}
                style={{ height: 38, padding: '0 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Скасувати
              </button>
              <button
                onClick={submitPrompt}
                disabled={busy || (prompt === 'brand' && !value.trim()) || (prompt === 'category' && !value)}
                style={{
                  height: 38, padding: '0 18px', borderRadius: 9, border: 'none',
                  background: prompt === 'delete' ? '#DC2626' : '#1E3A5F',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? 'Виконую…' : prompt === 'delete' ? `Видалити ${n}` : `Застосувати до ${n}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
