'use client';

import { useEffect, useState, useMemo } from 'react';

// Модель націнок: правила + попередній перегляд. Нічого не змінює у фідах —
// показує, якою стане кожна ціна, ЯКЩО модель увімкнути. Вмикання — окремим кроком,
// після того як цифри влаштують.

type Rule = {
  id: number;
  marketplace: 'all' | 'rozetka' | 'prom';
  scope: 'product' | 'brand_category' | 'category' | 'cost_band' | 'global';
  cost_from: number | null;
  cost_to: number | null;
  markup_pct: number | null;
  min_profit_uah: number | null;
  min_price_uah: number | null;
  round_step: number | null;
  exclude_single: boolean;
  note: string | null;
};

type Row = {
  sku: string; name: string; brand: string; category: string;
  cost: number; commissionPct: number;
  before: number; after: number; changePct: number;
  profitBefore: number; profitAfter: number;
  driver: 'markup' | 'min_profit' | 'min_price';
  excluded: boolean;
};

type Data = {
  marketplace: string;
  rules: Rule[];
  totals: {
    count: number; profitBefore: number; profitAfter: number;
    excluded: number; over50: number; over30: number; over15: number; upTo15: number;
  };
  rows: Row[];
};

const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;

export default function PricingModelClient() {
  const [mp, setMp] = useState<'rozetka' | 'prom'>('rozetka');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'excluded' | 'over30' | 'loss'>('all');
  const [saving, setSaving] = useState<number | null>(null);

  async function load(marketplace = mp) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/pricing-rules?marketplace=${marketplace}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }
  // load — стабільна за змістом, у залежності кладемо лише маркетплейс
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(mp); }, [mp]);

  async function saveRule(id: number, patch: Partial<Rule>) {
    setSaving(id);
    try {
      const res = await fetch('/api/admin/pricing-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  const bands = useMemo(
    () => (data?.rules ?? []).filter(r => r.scope === 'cost_band')
      .sort((a, b) => (a.cost_from ?? 0) - (b.cost_from ?? 0)),
    [data],
  );

  const visible = useMemo(() => {
    const rows = data?.rows ?? [];
    if (filter === 'excluded') return rows.filter(r => r.excluded);
    if (filter === 'over30')   return rows.filter(r => !r.excluded && r.changePct > 30);
    if (filter === 'loss')     return rows.filter(r => r.profitBefore < 25);
    return rows;
  }, [data, filter]);

  const t = data?.totals;

  return (
    <div style={{ padding: '32px 36px 64px', overflowY: 'auto', flex: 1 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Модель націнок</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 20px', maxWidth: 760 }}>
        Цільовий прибуток = <b>більше з двох</b>: відсоток від собівартості або абсолютний мінімум у гривнях.
        Мінімум гарантує, що відправка окупається навіть на дрібному товарі. Ціна = (собівартість + прибуток) ÷ (1 − комісія),
        округлення вгору. <b>Це лише розрахунок</b> — у фіди поки йдуть старі ціни.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['rozetka', 'prom'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMp(m)}
            style={{
              height: 34, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: mp === m ? 'none' : '1px solid var(--border)',
              background: mp === m ? '#1E3A5F' : 'var(--bg-card)',
              color: mp === m ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {m === 'rozetka' ? 'Rozetka' : 'Prom'}
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}
      {loading && <p style={{ color: '#94A3B8', fontSize: 13 }}>Рахуємо…</p>}

      {t && (
        <>
          {/* Підсумок */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 22 }}>
            <Card label="Товарів у розрахунку" value={String(t.count)} />
            <Card label="Прибуток зараз (сума з одиниці)" value={uah(t.profitBefore)} />
            <Card label="Прибуток за моделлю" value={uah(t.profitAfter)} accent="#16A34A" />
            <Card label="Не продавати поштучно" value={String(t.excluded)} accent="#DC2626"
                  hint="дрібнота — тільки мультипаком" />
          </div>

          {/* Драбина правил */}
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Смуги собівартості</h2>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 24, background: 'var(--bg-card)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-soft)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={th}>Смуга</th>
                  <th style={{ ...th, textAlign: 'right' }}>Націнка, %</th>
                  <th style={{ ...th, textAlign: 'right' }}>Мін. прибуток, ₴</th>
                  <th style={{ ...th, textAlign: 'center' }}>Не поштучно</th>
                  <th style={th}>Коментар</th>
                </tr>
              </thead>
              <tbody>
                {bands.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={td}>
                      {r.cost_from ?? 0}–{r.cost_to ?? '∞'} ₴
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <NumInput value={r.markup_pct} disabled={saving === r.id}
                                onSave={v => saveRule(r.id, { markup_pct: v } as Partial<Rule>)} />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <NumInput value={r.min_profit_uah} disabled={saving === r.id}
                                onSave={v => saveRule(r.id, { min_profit_uah: v } as Partial<Rule>)} />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input type="checkbox" checked={r.exclude_single} disabled={saving === r.id}
                             onChange={e => saveRule(r.id, { exclude_single: e.target.checked })}
                             style={{ width: 15, height: 15, cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...td, color: 'var(--text-muted)', fontSize: 12 }}>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Розподіл змін */}
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Наскільки зміняться ціни</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <Chip label={`до +15%: ${t.upTo15}`} active={filter === 'all'} onClick={() => setFilter('all')} />
            <Chip label={`+15…30%: ${t.over15}`} active={false} onClick={() => setFilter('all')} />
            <Chip label={`+30…50%: ${t.over30}`} active={filter === 'over30'} onClick={() => setFilter('over30')} color="#B45309" />
            <Chip label={`понад +50%: ${t.over50}`} active={filter === 'over30'} onClick={() => setFilter('over30')} color="#DC2626" />
            <Chip label={`не поштучно: ${t.excluded}`} active={filter === 'excluded'} onClick={() => setFilter('excluded')} color="#DC2626" />
            <Chip label="зараз майже без прибутку" active={filter === 'loss'} onClick={() => setFilter('loss')} color="#DC2626" />
          </div>

          {/* Таблиця товарів */}
          <div style={{ overflowX: 'auto', maxHeight: 620, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-card)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-soft)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ ...th, position: 'sticky', top: 0 }}>SKU</th>
                  <th style={{ ...th, position: 'sticky', top: 0 }}>Товар</th>
                  <th style={{ ...th, position: 'sticky', top: 0, textAlign: 'right' }}>Собів.</th>
                  <th style={{ ...th, position: 'sticky', top: 0, textAlign: 'right' }}>Зараз</th>
                  <th style={{ ...th, position: 'sticky', top: 0, textAlign: 'right' }}>Стане</th>
                  <th style={{ ...th, position: 'sticky', top: 0, textAlign: 'right' }}>Зміна</th>
                  <th style={{ ...th, position: 'sticky', top: 0, textAlign: 'right' }}>Прибуток</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 400).map(r => (
                  <tr key={r.sku} style={{ borderTop: '1px solid var(--border-light)', opacity: r.excluded ? 0.6 : 1 }}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{r.sku}</td>
                    <td style={{ ...td, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>
                      {r.name}
                      {r.excluded && <span style={{ marginLeft: 6, fontSize: 11, color: '#DC2626' }}>не поштучно</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{uah(r.cost)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{uah(r.before)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{uah(r.after)}</td>
                    <td style={{ ...td, textAlign: 'right', color: r.changePct > 30 ? '#DC2626' : r.changePct > 15 ? '#B45309' : 'var(--text-secondary)' }}>
                      {r.changePct > 0 ? '+' : ''}{r.changePct}%
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{Math.round(r.profitBefore)}</span>
                      {' → '}
                      <span style={{ color: '#16A34A', fontWeight: 600 }}>{Math.round(r.profitAfter)} ₴</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length > 400 && (
              <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                показано 400 з {visible.length}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 14px', fontWeight: 600, fontSize: 12, background: 'var(--bg-soft)' };
const td: React.CSSProperties = { padding: '9px 14px', color: 'var(--text-primary)' };

function Card({ label, value, accent, hint }: { label: string; value: string; accent?: string; hint?: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? 'var(--text-primary)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Chip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 30, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: `1px solid ${active ? (color ?? '#1E3A5F') : 'var(--border)'}`,
        background: active ? (color ?? '#1E3A5F') : 'var(--bg-card)',
        color: active ? '#fff' : (color ?? 'var(--text-secondary)'),
      }}
    >
      {label}
    </button>
  );
}

/** Число з підтвердженням по Enter/blur — щоб не смикати сервер на кожну цифру. */
function NumInput({ value, onSave, disabled }: { value: number | null; onSave: (v: number | null) => void; disabled?: boolean }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => { setV(value == null ? '' : String(value)); }, [value]);
  const commit = () => {
    const next = v.trim() === '' ? null : Number(v);
    if (next !== value) onSave(next);
  };
  return (
    <input
      value={v}
      disabled={disabled}
      onChange={e => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{
        width: 74, padding: '5px 8px', textAlign: 'right', fontSize: 13,
        border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-card)', color: 'var(--text-primary)',
      }}
    />
  );
}
