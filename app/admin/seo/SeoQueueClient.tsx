'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';

export type QueueItem = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  gaps: {
    thinDesc: boolean;   // description_full < порога — заповнюється кнопкою тут
    noFaq: boolean;      // немає FAQ — заповнюється кнопкою тут (разом з описом)
    noRu: boolean;       // немає name_ru/description_ru — AI-кнопка в картці товару
    noKeywords: boolean; // немає keywords — AI-кнопка в картці товару
    noChars: boolean;    // немає характеристик — AI-кнопка в картці товару
    noImage: boolean;    // немає фото — завантажити вручну
  };
};

type EnrichEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; description_full: string; faqCount: number }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

const COST_PER_PRODUCT_USD = 0.03;

const GAP_LABELS: { key: keyof QueueItem['gaps']; label: string; color: string }[] = [
  { key: 'thinDesc',   label: 'короткий опис',    color: '#F59E0B' },
  { key: 'noFaq',      label: 'немає FAQ',        color: '#F59E0B' },
  { key: 'noRu',       label: 'немає рос. версії', color: '#8B5CF6' },
  { key: 'noKeywords', label: 'немає keywords',   color: '#8B5CF6' },
  { key: 'noChars',    label: 'немає характеристик', color: '#EF4444' },
  { key: 'noImage',    label: 'немає фото',       color: '#EF4444' },
];

function hasAnyGap(item: QueueItem): boolean {
  return Object.values(item.gaps).some(Boolean);
}

export default function SeoQueueClient({ items, faqTableReady }: { items: QueueItem[]; faqTableReady: boolean }) {
  const [filter, setFilter] = useState<keyof QueueItem['gaps'] | 'any'>('any');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [currentName, setCurrentName] = useState('');
  const [log, setLog] = useState<{ sku: string; text: string; ok: boolean }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const withGaps = useMemo(() => items.filter(hasAnyGap), [items]);
  const visible = useMemo(
    () => (filter === 'any' ? withGaps : withGaps.filter(i => i.gaps[filter])),
    [withGaps, filter],
  );
  const gapCounts = useMemo(() => {
    const counts = {} as Record<keyof QueueItem['gaps'], number>;
    for (const g of GAP_LABELS) counts[g.key] = withGaps.filter(i => i.gaps[g.key]).length;
    return counts;
  }, [withGaps]);

  // Кнопка запускає генерацію опис+FAQ — має сенс тільки для товарів з цими пробілами
  const enrichable = useMemo(
    () => visible.filter(i => i.gaps.thinDesc || i.gaps.noFaq),
    [visible],
  );
  const selectedEnrichable = enrichable.filter(i => selected.has(i.sku));
  const cost = (selectedEnrichable.length * COST_PER_PRODUCT_USD).toFixed(2);

  function toggle(sku: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(enrichable.map(i => i.sku)));
  }

  async function start() {
    if (!selectedEnrichable.length) return;
    setRunning(true);
    setLog([]);
    setProgress({ done: 0, total: selectedEnrichable.length, errors: 0 });
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/admin/catalog/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: selectedEnrichable.map(i => i.sku), limit: selectedEnrichable.length }),
        signal: abortRef.current.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6)) as EnrichEvent;
          if (event.type === 'start') setProgress(p => ({ ...p, total: event.total }));
          else if (event.type === 'progress') setCurrentName(event.name);
          else if (event.type === 'result') {
            setProgress(p => ({ ...p, done: p.done + 1 }));
            setLog(l => [{ sku: event.sku, text: `${event.description_full.split(/\s+/).length} слів, FAQ: ${event.faqCount}`, ok: true }, ...l]);
          } else if (event.type === 'error') {
            setProgress(p => ({ ...p, errors: p.errors + 1 }));
            setLog(l => [{ sku: event.sku, text: event.error, ok: false }, ...l]);
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setLog(l => [{ sku: '', text: String(err), ok: false }, ...l]);
      }
    } finally {
      setRunning(false);
      setCurrentName('');
    }
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ padding: '32px 36px 64px', overflowY: 'auto', flex: 1 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>SEO-черга</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 20px' }}>
        Товари з пробілами SEO-контенту: {withGaps.length} з {items.length} активних.
        Генерація опису + FAQ запускається тільки вручну — кнопкою нижче, з оцінкою вартості.
        {!faqTableReady && ' ⚠️ Таблиця FAQ ще не створена (міграція 048) — генерація впаде на кроці FAQ.'}
      </p>

      {/* Фільтри-чипси */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setFilter('any')} style={chip(filter === 'any')}>
          Усі пробіли ({withGaps.length})
        </button>
        {GAP_LABELS.map(g => (
          <button key={g.key} onClick={() => setFilter(g.key)} style={chip(filter === g.key)}>
            {g.label} ({gapCounts[g.key]})
          </button>
        ))}
      </div>

      {/* Панель запуску */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--bg-card, #fff)', border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: 16 }}>
        <button onClick={selectAllVisible} disabled={running} style={btnGhost}>
          Вибрати всі з описом/FAQ ({enrichable.length})
        </button>
        <button onClick={() => setSelected(new Set())} disabled={running || !selected.size} style={btnGhost}>
          Скинути
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#475569' }}>
          Вибрано: <strong>{selectedEnrichable.length}</strong> · Орієнтовна вартість: <strong>${cost}</strong>
        </span>
        {!running ? (
          <button onClick={start} disabled={!selectedEnrichable.length || !faqTableReady} style={{ ...btnPrimary, opacity: selectedEnrichable.length && faqTableReady ? 1 : 0.5 }}>
            ▶ Згенерувати опис + FAQ
          </button>
        ) : (
          <button onClick={() => abortRef.current?.abort()} style={btnDanger}>■ Зупинити</button>
        )}
      </div>

      {/* Прогрес */}
      {(running || progress.done > 0) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: 6 }}>
            <span>{running ? `⏳ ${currentName}` : '✅ Завершено'}</span>
            <span>{progress.done} / {progress.total}{progress.errors > 0 && ` · ${progress.errors} помилок`}</span>
          </div>
          <div style={{ background: '#E2E8F0', borderRadius: 6, height: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: progress.errors ? '#F59E0B' : '#3DBFB8', transition: 'width .3s', borderRadius: 6 }} />
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', color: l.ok ? '#10B981' : '#EF4444' }}>
              {l.ok ? '✓' : '✗'} {l.sku} — {l.text}
            </div>
          ))}
        </div>
      )}

      {/* Таблиця */}
      <div style={{ background: 'var(--bg-card, #fff)', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
              <th style={th}></th>
              <th style={th}>SKU</th>
              <th style={th}>Товар</th>
              <th style={th}>Категорія</th>
              <th style={th}>Пробіли</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(item => {
              const canEnrich = item.gaps.thinDesc || item.gaps.noFaq;
              return (
                <tr key={item.sku} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.sku)}
                      disabled={!canEnrich || running}
                      onChange={() => toggle(item.sku)}
                    />
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>{item.sku}</td>
                  <td style={td}>{item.brand} {item.name}</td>
                  <td style={{ ...td, color: '#64748B', fontSize: 12 }}>{item.category}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {GAP_LABELS.filter(g => item.gaps[g.key]).map(g => (
                        <span key={g.key} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: `${g.color}18`, color: g.color, fontWeight: 600 }}>
                          {g.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={td}>
                    <Link href={`/admin/products/${item.sku}`} style={{ fontSize: 12, color: '#1E3A5F', fontWeight: 600, textDecoration: 'none' }}>
                      Картка →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#94A3B8', padding: 24 }}>Пробілів немає 🎉</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12 }}>
        «Опис + FAQ» генеруються пакетно тут. Російська версія, keywords і характеристики — AI-кнопкою в картці товару. Фото — вручну.
      </p>
    </div>
  );
}

const chip = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: `1px solid ${active ? '#1E3A5F' : '#CBD5E1'}`,
  background: active ? '#1E3A5F' : '#fff',
  color: active ? '#fff' : '#475569',
});

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' };
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' };

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', background: '#3DBFB8', color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnDanger: React.CSSProperties = { ...btnPrimary, background: '#EF4444' };
const btnGhost: React.CSSProperties = {
  padding: '9px 16px', background: '#fff', color: '#475569', border: '1px solid #CBD5E1',
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
