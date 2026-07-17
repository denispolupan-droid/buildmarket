'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';

export type QueueItem = {
  sku: string;
  slug: string | null;
  name: string;
  brand: string;
  category: string;
  gaps: {
    thinDesc: boolean;   // description_full < порога — заповнюється кнопкою тут
    noFaq: boolean;      // немає FAQ — заповнюється кнопкою тут (разом з описом)
    ruDesc: boolean;     // рос. опис застарів / FAQ без перекладу — кнопкою тут
    noRu: boolean;       // немає name_ru/description_ru — AI-кнопка в картці товару
    noKeywords: boolean; // немає keywords — AI-кнопка в картці товару
    noChars: boolean;    // немає характеристик — AI-кнопка в картці товару
    noImage: boolean;    // немає фото — завантажити вручну
  };
};

type EnrichEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; description_full: string; faqCount: number; ru: boolean }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

const COST_PER_PRODUCT_USD = 0.04; // укр генерація (opus) + рос переклад (haiku)

const GAP_LABELS: { key: keyof QueueItem['gaps']; label: string; color: string }[] = [
  { key: 'thinDesc',   label: 'короткий опис',    color: '#F59E0B' },
  { key: 'noFaq',      label: 'немає FAQ',        color: '#F59E0B' },
  { key: 'ruDesc',     label: 'рос. опис/FAQ',    color: '#F59E0B' },
  { key: 'noRu',       label: 'немає рос. назви', color: '#8B5CF6' },
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

  // Кнопка запускає генерацію опис+FAQ (укр) + переклад (рос) — для товарів з цими пробілами
  const enrichable = useMemo(
    () => visible.filter(i => i.gaps.thinDesc || i.gaps.noFaq || i.gaps.ruDesc),
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
            setLog(l => [{ sku: event.sku, text: `${event.description_full.split(/\s+/).length} слів, FAQ: ${event.faqCount}${event.ru ? ', рос. ✓' : ', рос. ✗'}`, ok: true }, ...l]);
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

  // ── "Дожим" запиту: посилення сторінки під конкретний пошуковий запит ──
  const [boostQuery, setBoostQuery] = useState('');
  const [boostSku, setBoostSku] = useState('');
  const [boostBusy, setBoostBusy] = useState<'' | 'product' | 'article'>('');
  const [boostMsg, setBoostMsg] = useState('');
  const boostItem = items.find(i => i.sku === boostSku.trim());

  async function boostProduct() {
    if (!boostQuery.trim() || !boostItem) return;
    setBoostBusy('product');
    setBoostMsg('');
    try {
      const res = await fetch('/api/admin/catalog/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: [boostItem.sku], limit: 1, targetQuery: boostQuery.trim() }),
      });
      // читаємо SSE-стрім до кінця, дивимось чи був result
      const text = await res.text();
      if (text.includes('"type":"result"')) {
        setBoostMsg(`✓ Картку ${boostItem.sku} перегенеровано під запит (опис + FAQ + keywords, обидві мови)`);
      } else {
        const err = /"error":"([^"]*)"/.exec(text)?.[1];
        throw new Error(err ?? 'генерація не повернула результат');
      }
    } catch (err) {
      setBoostMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBoostBusy('');
    }
  }

  async function boostArticle() {
    if (!boostQuery.trim()) return;
    setBoostBusy('article');
    setBoostMsg('');
    try {
      const res = await fetch('/api/admin/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: boostQuery.trim(),
          focusQuery: boostQuery.trim(),
          ...(boostItem ? { mustLink: { href: `/product/${boostItem.slug ?? boostItem.sku}`, label: `${boostItem.brand} ${boostItem.name}` } } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBoostMsg(`✓ Стаття-чернетка «${data.title}» створена — опублікуйте її в розділі Блог`);
    } catch (err) {
      setBoostMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBoostBusy('');
    }
  }

  return (
    <div style={{ padding: '32px 36px 64px', overflowY: 'auto', flex: 1 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>SEO-черга</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 20px' }}>
        Товари з пробілами SEO-контенту: {withGaps.length} з {items.length} активних.
        Генерація опису + FAQ запускається тільки вручну — кнопкою нижче, з оцінкою вартості.
        {!faqTableReady && ' ⚠️ Таблиця FAQ ще не створена (міграція 048) — генерація впаде на кроці FAQ.'}
      </p>

      {/* Дожим запиту: посилення сторінок під запити з GSC (позиції 11–30) */}
      <div style={{ padding: '16px 20px', background: 'var(--bg-card, #fff)', border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>🎯 Дожим запиту</div>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 12px' }}>
          Запити з 2–3 сторінки Google (Search Console → Ефективність, позиції 11–30) дожимаємо контентом:
          посилення картки товару (~$0.04) та/або стаття в блог під запит (~$0.20, чернетка).
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={boostQuery}
            onChange={e => setBoostQuery(e.target.value)}
            disabled={!!boostBusy}
            placeholder="Пошуковий запит, напр.: грунтовка для газобетону яка краще"
            style={{ flex: 2, minWidth: 260, padding: '9px 13px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
          />
          <input
            value={boostSku}
            onChange={e => setBoostSku(e.target.value)}
            disabled={!!boostBusy}
            placeholder="SKU товару (напр. 1203-002)"
            style={{ width: 180, padding: '9px 13px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, fontFamily: 'monospace' }}
          />
          <button
            onClick={boostProduct}
            disabled={!!boostBusy || !boostQuery.trim() || !boostItem}
            title={boostSku && !boostItem ? 'SKU не знайдено серед активних товарів' : ''}
            style={{ ...btnPrimary, opacity: boostBusy || !boostQuery.trim() || !boostItem ? 0.5 : 1 }}
          >
            {boostBusy === 'product' ? '⏳ Генеруємо…' : 'Посилити товар'}
          </button>
          <button
            onClick={boostArticle}
            disabled={!!boostBusy || !boostQuery.trim()}
            style={{ ...btnPrimary, background: '#4880B8', opacity: boostBusy || !boostQuery.trim() ? 0.5 : 1 }}
          >
            {boostBusy === 'article' ? '⏳ Пишемо (1–2 хв)…' : 'Стаття під запит'}
          </button>
        </div>
        {boostSku.trim() && (
          <p style={{ fontSize: 12, margin: '8px 0 0', color: boostItem ? '#10B981' : '#EF4444' }}>
            {boostItem ? `Товар: ${boostItem.brand} ${boostItem.name}` : 'SKU не знайдено серед активних товарів'}
          </p>
        )}
        {boostMsg && <p style={{ fontSize: 13, margin: '8px 0 0', color: boostMsg.startsWith('✓') ? '#10B981' : '#EF4444' }}>{boostMsg}</p>}
      </div>

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
              const canEnrich = item.gaps.thinDesc || item.gaps.noFaq || item.gaps.ruDesc;
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
        «Опис + FAQ» генеруються пакетно тут одразу двома мовами (укр + рос). Рос. назва, keywords і характеристики — AI-кнопкою в картці товару. Фото — вручну.
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
