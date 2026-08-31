'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Search } from 'lucide-react';
import { hryvniaInWords } from '../../../lib/number-to-words';

/**
 * Редагування позицій документа — спільне для видаткової та рахунку на оплату.
 *
 * Один компонент на два екрани навмисно: це та сама робота (склад, кількість,
 * ціна, дата, підсумок), і розійтися вони не мають права — інакше в накладній
 * і в рахунку по одній угоді з'являться різні цифри.
 *
 * Куди пишемо — вирішує `target`:
 *   sale-doc — рядки РН обліку (лише поки вона чернетка);
 *   order    — позиції ЗАМОВЛЕННЯ, з якого будується рахунок. Цей шлях уже
 *              вміє синхронізувати чернетку РН і перерахувати комісію МП
 *              (див. PATCH /api/admin/orders/[id]), тому правка рахунку
 *              автоматично доїжджає й до накладної.
 *
 * Сума рахується тут лише для показу; при збереженні сервер перераховує її
 * заново з рядків.
 */

export type EditableLine = { sku: string; name: string; qty: number; price: number };

export type EditorTarget =
  | { kind: 'sale-doc'; docId: string }
  | { kind: 'order'; orderId: string };

type Found = { sku: string; name: string; brand: string; volume: string | null };
const money = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inputStyle: React.CSSProperties = {
  width: '100%', height: '32px', padding: '0 8px', boxSizing: 'border-box',
  borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-card)',
  color: 'var(--text-primary)', fontSize: '13px',
};

const GRID = '120px minmax(0,1fr) 84px 110px 110px 32px';

export default function LinesEditor({ target, docDate, initial, title, hint }: {
  target: EditorTarget;
  title?: string;
  hint?: string;
  docDate: string;
  initial: EditableLine[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<EditableLine[]>(initial);
  const [date, setDate] = useState(docDate.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  // Зауваження обліку: правку збережено, але є що побачити до друку.
  const [warnings, setWarnings] = useState<string[]>([]);

  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const searchSeq = useRef(0);

  // Пошук товару для нового рядка. Гонки відповідей ловимо лічильником:
  // без нього повільна відповідь на «фар» перетирає свіжу на «фарба».
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setFound([]); return; }
    const seq = ++searchSeq.current;
    const t = setTimeout(() => {
      fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then((d: Found[]) => { if (seq === searchSeq.current) setFound(Array.isArray(d) ? d : []); })
        .catch(() => { if (seq === searchSeq.current) setFound([]); });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial) || date !== docDate.slice(0, 10);
  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);

  function patch(i: number, field: 'qty' | 'price', raw: string) {
    const v = Number(raw.replace(',', '.'));
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: Number.isFinite(v) ? v : 0 } : r));
    setSaved(false);
  }

  function add(p: Found) {
    const name = [p.brand, p.name].filter(Boolean).join(' ').trim();
    setRows(prev => prev.some(r => r.sku === p.sku)
      // Той самий артикул двічі — це майже завжди «додав ще одну штуку»,
      // а не окремий рядок: у друкованій формі дублі читаються як помилка.
      ? prev.map(r => r.sku === p.sku ? { ...r, qty: r.qty + 1 } : r)
      : [...prev, { sku: p.sku, name, qty: 1, price: 0 }]);
    setQuery(''); setFound([]); setSaved(false);
  }

  async function save() {
    setBusy(true); setError(''); setSaved(false); setWarnings([]);
    try {
      // total_price НЕ шлемо навмисно: сервер порахує суму з позицій сам.
      // Так у рахунку не може опинитись підсумок, що не збігається з рядками.
      const req = target.kind === 'sale-doc'
        ? {
            url: '/api/admin/accounting/documents',
            method: 'POST',
            body: {
              action: 'update_lines',
              document_id: target.docId,
              doc_date: date,
              lines: rows.map(r => ({ sku: r.sku, qty: r.qty, price: r.price })),
            },
          }
        : {
            url: `/api/admin/orders/${target.orderId}`,
            method: 'PATCH',
            body: {
              createdAt: date,
              // Звідки прийшла правка — щоб у журналі було видно екран, а не
              // тільки замовлення: розбирати скарги інакше неможливо.
              edit_source: 'invoice',
              items: rows.map(r => ({ sku: r.sku, name: r.name, qty: r.qty, price: r.price })),
            },
          };

      const res = await fetch(req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const d = await res.json();
      if (!res.ok || d.error) { setError(d.error ?? 'Не вдалося зберегти'); return; }
      if (Array.isArray(d.warnings)) setWarnings(d.warnings as string[]);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Збій мережі');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{title ?? 'Редагування чернетки'}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {hint ?? 'Правки потраплять і в друковану форму, і в облік — це один документ.'}
        </span>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Дата
          <input type="date" value={date} onChange={e => { setDate(e.target.value); setSaved(false); }}
            style={{ ...inputStyle, width: '150px' }} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '7px 16px', background: 'var(--bg-soft)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '12px' }}>
        <span>Артикул</span><span>Найменування</span>
        <span style={{ textAlign: 'right' }}>К-сть</span>
        <span style={{ textAlign: 'right' }}>Ціна</span>
        <span style={{ textAlign: 'right' }}>Сума</span>
        <span />
      </div>

      {rows.map((r, i) => (
        <div key={`${r.sku}-${i}`} style={{ display: 'grid', gridTemplateColumns: GRID, padding: '7px 16px', alignItems: 'center', borderTop: '1px solid var(--border-light)', columnGap: '12px' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11.5px', color: 'var(--text-muted)' }}>{r.sku}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <input value={String(r.qty)} onChange={e => patch(i, 'qty', e.target.value)} inputMode="decimal"
            style={{ ...inputStyle, textAlign: 'right' }} />
          <input value={String(r.price)} onChange={e => patch(i, 'price', e.target.value)} inputMode="decimal"
            style={{ ...inputStyle, textAlign: 'right' }} />
          <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {money((Number(r.qty) || 0) * (Number(r.price) || 0))}
          </span>
          <button onClick={() => { setRows(prev => prev.filter((_, idx) => idx !== i)); setSaved(false); }}
            title="Прибрати рядок"
            style={{ height: '28px', width: '28px', borderRadius: '7px', border: '1px solid var(--border-light)', background: 'transparent', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      {rows.length === 0 && (
        <div style={{ padding: '12px 16px', fontSize: '12.5px', color: '#B45309', borderTop: '1px solid var(--border-light)' }}>
          Не лишилось жодного рядка — накладна без товарів не зберігається.
        </div>
      )}

      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Search size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Додати товар: артикул або назва"
            style={{ ...inputStyle, maxWidth: '360px' }} />
        </div>
        {found.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 20, left: '16px', right: '16px', top: '46px', maxHeight: '260px', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '9px', boxShadow: '0 12px 32px rgba(0,0,0,0.14)' }}>
            {found.map(p => (
              <button key={p.sku} onClick={() => add(p)}
                style={{ display: 'flex', width: '100%', gap: '10px', alignItems: 'center', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                <Plus size={13} color="#15803D" style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11.5px', color: 'var(--text-muted)', flexShrink: 0 }}>{p.sku}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[p.brand, p.name].filter(Boolean).join(' ')}{p.volume ? `, ${p.volume}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Всього найменувань: <b>{rows.length}</b>, на суму</span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{money(total)} грн</span>
        </div>
        <div style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--text-muted)', marginTop: '2px' }}>{hryvniaInWords(total)}</div>

        {error && (
          <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', padding: '9px 11px' }}>⚠ {error}</div>
        )}

        {warnings.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '9px', padding: '9px 11px' }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>Збережено, але зверніть увагу:</div>
            {warnings.map((w, i) => <div key={i} style={{ marginTop: i ? '3px' : 0 }}>• {w}</div>)}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={save} disabled={busy || !dirty || rows.length === 0}
            style={{ height: '36px', padding: '0 18px', borderRadius: '9px', border: 'none', fontSize: '13px', fontWeight: 700,
              background: busy || !dirty || rows.length === 0 ? '#94A3B8' : '#15803D', color: '#fff',
              cursor: busy || !dirty || rows.length === 0 ? 'default' : 'pointer' }}>
            {busy ? 'Зберігаємо…' : 'Зберегти зміни'}
          </button>
          {dirty && (
            <button onClick={() => { setRows(initial); setDate(docDate.slice(0, 10)); setError(''); }} disabled={busy}
              style={{ height: '36px', padding: '0 14px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              Повернути як було
            </button>
          )}
          {saved && !dirty && <span style={{ fontSize: '12.5px', color: '#15803D', fontWeight: 600 }}>✓ Збережено</span>}
          {!dirty && !saved && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Змін немає</span>}
        </div>
      </div>
    </div>
  );
}
