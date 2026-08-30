'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProductGaps, QueueItem } from '../../../../lib/seo/product-gaps';
import { badge, btnDanger, btnGhost, btnPrimary, card, chip, hint, num, td, th, TONE, type Tone } from '../ui';
import HelpBox from '../HelpBox';
import { HELP_PRODUCTS } from '../help-content';

type EnrichEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; description_full: string; faqCount: number; ru: boolean; costUsd: number }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

/** Орієнтир для попереднього підрахунку; фактичну вартість пише журнал дій. */
const COST_PER_PRODUCT_USD = 0.04;

const GAP_LABELS: { key: keyof ProductGaps; label: string; tone: Tone }[] = [
  { key: 'thinDesc',        label: 'короткий опис',       tone: 'warn' },
  { key: 'noFaq',           label: 'немає FAQ',           tone: 'warn' },
  { key: 'ruDesc',          label: 'рос. опис/FAQ',       tone: 'warn' },
  { key: 'noRu',            label: 'немає рос. назви',    tone: 'info' },
  { key: 'noKeywords',      label: 'немає keywords',      tone: 'info' },
  { key: 'noChars',         label: 'немає характеристик', tone: 'danger' },
  { key: 'missingRequired', label: 'обовʼязкові хар-ки',  tone: 'danger' },
  { key: 'dirtyChars',      label: 'ненормовані лейбли',  tone: 'info' },
  { key: 'offDict',         label: 'значення поза довідником', tone: 'info' },
  { key: 'noImage',         label: 'немає фото',          tone: 'danger' },
];

/** Пробіли, які закриває генерація. Фото сюди не входить — його вантажать руками. */
const ENRICHABLE: (keyof ProductGaps)[] =
  ['thinDesc', 'noFaq', 'ruDesc', 'noRu', 'noKeywords', 'noChars', 'missingRequired', 'offDict'];

const canEnrich = (item: QueueItem) => ENRICHABLE.some(k => item.gaps[k]);

export default function ProductQueueClient({ items, total }: { items: QueueItem[]; total: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<keyof ProductGaps | 'any'>('any');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0, spent: 0 });
  const [currentName, setCurrentName] = useState('');
  const [log, setLog] = useState<{ sku: string; text: string; ok: boolean }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const visible = useMemo(
    () => (filter === 'any' ? items : items.filter(i => i.gaps[filter])),
    [items, filter],
  );
  const gapCounts = useMemo(() => {
    const counts = {} as Record<keyof ProductGaps, number>;
    for (const g of GAP_LABELS) counts[g.key] = items.filter(i => i.gaps[g.key]).length;
    return counts;
  }, [items]);

  const enrichable = useMemo(() => visible.filter(canEnrich), [visible]);
  const selectedEnrichable = enrichable.filter(i => selected.has(i.sku));
  const cost = (selectedEnrichable.length * COST_PER_PRODUCT_USD).toFixed(2);
  // нормалізація тепер канонізує і значення (довідник фасетів) — беремо й «поза довідником»
  const dirtyVisible = useMemo(() => visible.filter(i => i.gaps.dirtyChars || i.gaps.offDict), [visible]);

  // Вибір скидається разом з фільтром: інакше відмічені в іншому фільтрі товари
  // лишаються в наборі невидимими, і кнопка запускає не те, що на екрані.
  function changeFilter(next: keyof ProductGaps | 'any') {
    setFilter(next);
    setSelected(new Set());
  }

  function toggle(sku: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }

  async function start() {
    if (!selectedEnrichable.length) return;
    setRunning(true);
    setLog([]);
    setProgress({ done: 0, total: selectedEnrichable.length, errors: 0, spent: 0 });
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
      for (;;) {
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
            setProgress(p => ({ ...p, done: p.done + 1, spent: p.spent + (event.costUsd ?? 0) }));
            setLog(l => [{
              sku: event.sku,
              text: `${event.description_full.split(/\s+/).length} слів, FAQ: ${event.faqCount}${event.ru ? ', рос. ✓' : ', рос. ✗'} · $${(event.costUsd ?? 0).toFixed(3)}`,
              ok: true,
            }, ...l]);
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
      setSelected(new Set());
      router.refresh(); // черга перераховується сама — руками F5 більше не треба
    }
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const [normBusy, setNormBusy] = useState(false);
  const [normMsg, setNormMsg] = useState('');

  async function normalizeDirty() {
    if (!dirtyVisible.length || normBusy) return;
    setNormBusy(true);
    setNormMsg('');
    try {
      let changed = 0;
      const skus = dirtyVisible.map(i => i.sku);
      for (let i = 0; i < skus.length; i += 100) {
        const res = await fetch('/api/admin/characteristics/normalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus: skus.slice(i, i + 100) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        changed += (data.changed ?? []).length;
      }
      setNormMsg(`✓ Нормалізовано ${changed} товарів`);
      router.refresh();
    } catch (err) {
      setNormMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setNormBusy(false);
    }
  }

  return (
    <div>
      <HelpBox content={HELP_PRODUCTS} />
      <p style={{ ...hint, margin: '0 0 14px' }}>
        Товари з пробілами SEO-контенту: <b style={{ color: 'var(--text-primary)' }}>{items.length}</b> з {total} активних.
      </p>

      {items.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '36px 18px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-success)' }}>Пробілів немає 🎉</div>
          <p style={{ ...hint, margin: '6px 0 0' }}>
            Усі {total} активних товарів мають опис, FAQ, keywords, характеристики й фото обома мовами.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button onClick={() => changeFilter('any')} style={chip(filter === 'any')}>
              Усі пробіли ({items.length})
            </button>
            {GAP_LABELS.filter(g => gapCounts[g.key] > 0).map(g => (
              <button key={g.key} onClick={() => changeFilter(g.key)} style={chip(filter === g.key)}>
                {g.label} ({gapCounts[g.key]})
              </button>
            ))}
          </div>

          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <button onClick={() => setSelected(new Set(enrichable.map(i => i.sku)))} disabled={running} style={btnGhost}>
              Вибрати всі ({enrichable.length})
            </button>
            <button onClick={() => setSelected(new Set())} disabled={running || !selected.size} style={btnGhost}>
              Скинути
            </button>
            <button
              onClick={normalizeDirty}
              disabled={normBusy || running || !dirtyVisible.length}
              title="Звести лейбли-синоніми до канонічних за словником (без AI, безкоштовно)"
              style={{ ...btnGhost, opacity: dirtyVisible.length ? 1 : 0.5 }}
            >
              {normBusy ? '⏳ Нормалізуємо…' : `Нормалізувати лейбли й значення (${dirtyVisible.length})`}
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Вибрано: <strong>{selectedEnrichable.length}</strong> · Орієнтовно: <strong>${cost}</strong>
            </span>
            {!running ? (
              <button
                onClick={start}
                disabled={!selectedEnrichable.length}
                style={{ ...btnPrimary, opacity: selectedEnrichable.length ? 1 : 0.5 }}
              >
                ▶ Заповнити пробіли
              </button>
            ) : (
              <button onClick={() => abortRef.current?.abort()} style={btnDanger}>■ Зупинити</button>
            )}
          </div>

          {normMsg && (
            <p style={{ fontSize: 13, margin: '0 0 12px', color: normMsg.startsWith('✓') ? TONE.ok : TONE.danger }}>
              {normMsg}
            </p>
          )}

          {(running || progress.done > 0) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>{running ? `⏳ ${currentName}` : '✅ Завершено'}</span>
                <span>
                  {progress.done} / {progress.total}
                  {progress.errors > 0 && ` · ${progress.errors} помилок`}
                  {progress.spent > 0 && ` · факт $${progress.spent.toFixed(2)}`}
                </span>
              </div>
              <div className="fin-funnel-track">
                <div className="fin-funnel-fill" style={{ width: `${pct}%`, background: progress.errors ? TONE.warn : 'var(--brand-teal)' }} />
              </div>
            </div>
          )}

          {log.length > 0 && (
            <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {log.map((l, i) => (
                <div key={i} style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: l.ok ? TONE.ok : TONE.danger }}>
                  {l.ok ? '✓' : '✗'} {l.sku} — {l.text}
                </div>
              ))}
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-soft)' }}>
                  <th style={th}></th>
                  <th style={th}>SKU</th>
                  <th style={th}>Товар</th>
                  <th style={th}>Категорія</th>
                  <th style={th}>Пробіли</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(item => (
                  <tr key={item.sku}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={selected.has(item.sku)}
                        disabled={!canEnrich(item) || running}
                        onChange={() => toggle(item.sku)}
                      />
                    </td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {item.sku}
                    </td>
                    <td style={td}>{item.brand} {item.name}</td>
                    <td style={{ ...td, color: 'var(--text-muted)', fontSize: 12 }}>{item.category}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {GAP_LABELS.filter(g => item.gaps[g.key]).map(g => (
                          <span
                            key={g.key}
                            title={g.key === 'missingRequired' ? item.missingLabels.join(', ') : g.key === 'offDict' ? item.offDictLabels.join(', ') : undefined}
                            style={badge(g.tone)}
                          >
                            {g.key === 'missingRequired' ? `обовʼязкові хар-ки: ${num(item.missingLabels.length)}` : g.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={td}>
                      <Link href={`/admin/products/${item.sku}`} style={{ fontSize: 12, color: 'var(--brand-blue)', fontWeight: 600, textDecoration: 'none' }}>
                        Картка →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
