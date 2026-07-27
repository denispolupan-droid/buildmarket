'use client';

import { useState, useRef } from 'react';
import { X, Wand2 } from 'lucide-react';
import type { ProductFull } from '../../../types';

type FillEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; name: string }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

type ItemStatus = 'pending' | 'processing' | 'done' | 'error';

export type FillFields = {
  description: boolean;
  description_full: boolean;
  keywords: boolean;
  characteristics: boolean;
};

type Props = {
  skus: string[];
  products: ProductFull[];
  onClose: () => void;
  onDone?: () => void;
};

const FIELD_LABELS: { key: keyof FillFields; label: string; hint: string }[] = [
  { key: 'description',      label: 'Короткий опис',   hint: 'description UA + RU' },
  { key: 'description_full', label: 'Повний опис',     hint: 'description_full UA + RU' },
  { key: 'keywords',         label: 'Ключові слова',   hint: 'keywords UA + RU для SEO і Prom' },
  { key: 'characteristics',  label: 'Характеристики',  hint: 'таблиця параметрів — основа фільтрів' },
];

export default function AiFillModal({ skus, products, onClose, onDone }: Props) {
  const [running, setRunning]   = useState(false);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [fields, setFields]     = useState<FillFields>({
    description:      true,
    description_full: true,
    keywords:         true,
    characteristics:  false, // off by default — protect manual edits
  });
  // «Повністю переписати»: регенерувати ВЕСЬ контент, навіть уже заповнений
  // (включно з FAQ і рос. назвою). Ігнорує вибір полів нижче.
  const [force, setForce] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const selected = products.filter(p => skus.includes(p.sku));
  const anyFieldSelected = force || Object.values(fields).some(Boolean);

  function toggleField(key: keyof FillFields) {
    setFields(f => ({ ...f, [key]: !f[key] }));
  }

  async function start() {
    setRunning(true);
    setFinished(false);
    setStatuses({});
    setErrors({});
    setProgress({ done: 0, total: 0, errors: 0 });

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/admin/products/ai-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus, fields, force }),
        signal: abortRef.current.signal,
      });

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';
      let   gotDone = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6)) as FillEvent;

          if (event.type === 'start') {
            setProgress(p => ({ ...p, total: event.total }));
          } else if (event.type === 'progress') {
            // Позначаємо товар "в обробці". Лічильник done НЕ чіпаємо — при
            // паралельній обробці кілька progress-подій несуть однакове done;
            // рахуємо прогрес лише по result/error (єдине джерело правди).
            setStatuses(s => ({ ...s, [event.sku]: 'processing' }));
          } else if (event.type === 'result') {
            setStatuses(s => ({ ...s, [event.sku]: 'done' }));
            setProgress(p => ({ ...p, done: p.done + 1 }));
          } else if (event.type === 'error') {
            setStatuses(s => ({ ...s, [event.sku]: 'error' }));
            if (event.sku) setErrors(e => ({ ...e, [event.sku]: event.error }));
            setProgress(p => ({ ...p, errors: p.errors + 1 }));
          } else if (event.type === 'done') {
            gotDone = true;
            setProgress(p => ({ ...p, done: event.done, errors: event.errors }));
            setFinished(true);
            onDone?.();
          }
        }
      }

      // Потік завершився без фінального 'done' (напр., функція вперлась у ліміт часу).
      // Не мовчимо: показуємо, що обробку обірвано, а не скидаємо форму.
      if (!gotDone) {
        setStatuses(s => {
          const next = { ...s };
          for (const sku of skus) if (next[sku] === 'processing') next[sku] = 'error';
          return next;
        });
        setFinished(true);
        onDone?.();
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('AI fill error:', err);
      }
    } finally {
      setRunning(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const statusIcon = (sku: string) => {
    const s = statuses[sku];
    if (s === 'done')       return <span style={{ color: '#22C55E', fontSize: 13 }}>✓</span>;
    if (s === 'error')      return <span style={{ color: '#EF4444', fontSize: 13 }}>✗</span>;
    if (s === 'processing') return <span style={{ color: '#F59E0B', fontSize: 12 }}>⏳</span>;
    return <span style={{ color: '#CBD5E1', fontSize: 12 }}>○</span>;
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wand2 size={20} color="#3DBFB8" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>AI заповнення карток</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{selected.length} товарів вибрано</div>
            </div>
          </div>
          {!running && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
              <X size={20} />
            </button>
          )}
        </div>

        {/* Field selector — shows only before start */}
        {!running && !finished && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0' }}>
            {/* Повний перепис — перезаписує ВЕСЬ контент */}
            <label
              onClick={() => setForce(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${force ? '#F59E0B' : '#E2E8F0'}`, background: force ? '#FFFBEB' : '#F8FAFC' }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: `2px solid ${force ? '#F59E0B' : '#CBD5E1'}`,
                background: force ? '#F59E0B' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {force && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
              </div>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#92400E' }}>Повністю переписати картку</span>
                <span style={{ fontSize: 12, color: '#B45309', marginLeft: 6 }}>перезаписати ВЕСЬ контент, навіть заповнений (опис, keywords, характеристики, FAQ, рос. назва)</span>
              </div>
            </label>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {force ? 'Буде перезаписано все (вибір полів вимкнено)' : 'Що заповнити'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: force ? 0.4 : 1, pointerEvents: force ? 'none' : 'auto' }}>
              {FIELD_LABELS.map(({ key, label, hint }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <div
                    onClick={() => toggleField(key)}
                    style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${fields[key] ? '#3DBFB8' : '#CBD5E1'}`,
                      background: fields[key] ? '#3DBFB8' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {fields[key] && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                  </div>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#1E293B' }}>{label}</span>
                    <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 6 }}>{hint}</span>
                    {key === 'characteristics' && !fields[key] && (
                      <span style={{ fontSize: 11, color: '#F59E0B', marginLeft: 6, fontWeight: 500 }}>⚠ вимкнено — захист ручних правок</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Summary of selected fields during/after run */}
        {(running || finished) && (
          <div style={{ padding: '10px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FIELD_LABELS.filter(f => fields[f.key]).map(f => (
              <span key={f.key} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#F0FDFA', border: '1px solid #99F6E4', color: '#0D9488', fontWeight: 500 }}>
                {f.label}
              </span>
            ))}
          </div>
        )}

        {/* Progress */}
        {(running || finished) && (
          <div style={{ padding: '12px 24px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', marginBottom: 6 }}>
              <span>{finished ? '✅ Завершено' : `Обробка ${progress.done + 1} з ${progress.total}...`}</span>
              <span>{progress.done}/{progress.total}{progress.errors > 0 ? ` · ${progress.errors} помилок` : ''}</span>
            </div>
            <div style={{ background: '#E2E8F0', borderRadius: 6, height: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: progress.errors > 0 ? '#F59E0B' : '#3DBFB8',
                transition: 'width 0.3s', borderRadius: 6,
              }} />
            </div>
          </div>
        )}

        {/* Product list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {!running && !finished && (
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 10 }}>
              {selected.length > 5 && (
                <span style={{ color: '#F59E0B' }}>⏱ Орієнтовний час: ~{Math.max(1, Math.ceil(selected.length * 50 / 6 / 60))} хв. (по 6 паралельно)</span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selected.map(p => (
              <div key={p.sku} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 8,
                background: statuses[p.sku] === 'done' ? '#F0FDF4' : statuses[p.sku] === 'error' ? '#FEF2F2' : statuses[p.sku] === 'processing' ? '#FFFBEB' : '#F8FAFC',
                border: `1px solid ${statuses[p.sku] === 'done' ? '#BBF7D0' : statuses[p.sku] === 'error' ? '#FECACA' : statuses[p.sku] === 'processing' ? '#FDE68A' : '#E2E8F0'}`,
                transition: 'background 0.2s, border-color 0.2s',
              }}>
                <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>{statusIcon(p.sku)}</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748B', flexShrink: 0 }}>{p.sku}</span>
                <span style={{ fontSize: 13, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                {errors[p.sku] && (
                  <span style={{ fontSize: 11, color: '#EF4444', marginLeft: 'auto', flexShrink: 0 }} title={errors[p.sku]}>помилка</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          {!running && !finished && (
            <>
              <button onClick={onClose} style={{
                height: 40, padding: '0 20px', borderRadius: 8, border: '1px solid #E2E8F0',
                background: '#fff', color: '#475569', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}>
                Скасувати
              </button>
              <button
                onClick={start}
                disabled={!anyFieldSelected}
                style={{
                  height: 40, padding: '0 24px', borderRadius: 8, border: 'none',
                  background: anyFieldSelected ? '#3DBFB8' : '#E2E8F0',
                  color: anyFieldSelected ? '#fff' : '#94A3B8',
                  fontSize: 14, fontWeight: 600,
                  cursor: anyFieldSelected ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <Wand2 size={15} /> Запустити ({selected.length})
              </button>
            </>
          )}
          {running && (
            <button onClick={stop} style={{
              height: 40, padding: '0 24px', borderRadius: 8, border: 'none',
              background: '#EF4444', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              ■ Зупинити
            </button>
          )}
          {finished && (
            <button onClick={onClose} style={{
              height: 40, padding: '0 24px', borderRadius: 8, border: 'none',
              background: '#22C55E', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              ✓ Готово
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
