'use client';

import { useState, useRef } from 'react';

type EnrichEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; description_full: string }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

type LogItem = { sku: string; name?: string; description_full?: string; error?: string; status: 'ok' | 'error' };

type Props = {
  totalMissing: number;
  categories: { slug: string; cnt: number }[];
};

export default function EnrichClient({ totalMissing, categories }: Props) {
  const [running, setRunning]     = useState(false);
  const [done, setDone]           = useState(false);
  const [limit, setLimit]         = useState(10);
  const [category, setCategory]   = useState('');
  const [progress, setProgress]   = useState({ done: 0, total: 0, errors: 0 });
  const [log, setLog]             = useState<LogItem[]>([]);
  const [currentName, setCurrentName] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function start() {
    setRunning(true);
    setDone(false);
    setLog([]);
    setProgress({ done: 0, total: 0, errors: 0 });
    setCurrentName('');

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/admin/catalog/enrich', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ limit, category: category || undefined }),
        signal:  abortRef.current.signal,
      });

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6)) as EnrichEvent;

          if (event.type === 'start') {
            setProgress(p => ({ ...p, total: event.total }));
          } else if (event.type === 'progress') {
            setProgress(p => ({ ...p, done: event.done }));
            setCurrentName(event.name);
          } else if (event.type === 'result') {
            setLog(l => [{ sku: event.sku, description_full: event.description_full, status: 'ok' }, ...l]);
            setProgress(p => ({ ...p, done: p.done + 1 }));
          } else if (event.type === 'error') {
            setLog(l => [{ sku: event.sku, error: event.error, status: 'error' }, ...l]);
            setProgress(p => ({ ...p, errors: p.errors + 1 }));
          } else if (event.type === 'done') {
            setProgress(p => ({ ...p, done: event.done, errors: event.errors }));
            setDone(true);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setLog(l => [{ sku: '', error: String(err), status: 'error' }, ...l]);
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

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
        Агент збагачення каталогу
      </h1>
      <p style={{ color: 'var(--text-soft)', marginBottom: 28, fontSize: 14 }}>
        Генерує <code>description_full</code> за допомогою AI на основі характеристик та прикладів з категорії.
        Без опису: <strong>{totalMissing}</strong> товарів.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <label style={labelStyle}>Категорія</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            disabled={running}
            style={selectStyle}
          >
            <option value="">Всі категорії</option>
            {categories.map(c => (
              <option key={c.slug} value={c.slug}>{c.slug} ({c.cnt})</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Кількість товарів</label>
          <input
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            disabled={running}
            style={{ ...selectStyle, width: 100 }}
          />
        </div>

        {!running ? (
          <button onClick={start} style={btnPrimary}>
            ▶ Запустити
          </button>
        ) : (
          <button onClick={stop} style={btnDanger}>
            ■ Зупинити
          </button>
        )}
      </div>

      {/* Progress */}
      {(running || done) && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            <span>{running && currentName ? `⏳ ${currentName}` : done ? '✅ Завершено' : ''}</span>
            <span>{progress.done} / {progress.total} {progress.errors > 0 && `· ${progress.errors} помилок`}</span>
          </div>
          <div style={{ background: 'var(--border)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: progress.errors > 0 ? 'var(--amber)' : 'var(--brand-teal)',
              transition: 'width 0.3s',
              borderRadius: 6,
            }} />
          </div>
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {log.map((item, i) => (
            <div key={i} style={{
              background: item.status === 'error' ? 'var(--bg-danger)' : 'var(--bg-soft)',
              border: `1px solid ${item.status === 'error' ? 'var(--danger-border)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: item.description_full ? 6 : 0, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-soft)', fontFamily: 'monospace' }}>
                  {item.sku}
                </span>
                {item.status === 'ok'
                  ? <span style={{ fontSize: 11, color: 'var(--emerald-bright)' }}>✓ готово</span>
                  : <span style={{ fontSize: 11, color: 'var(--danger-bright)' }}>✗ помилка</span>
                }
              </div>
              {item.description_full && (
                <p style={{ fontSize: 13, color: '#334155', margin: 0, lineHeight: 1.5 }}>
                  {item.description_full}
                </p>
              )}
              {item.error && (
                <p style={{ fontSize: 12, color: 'var(--danger-bright)', margin: 0, fontFamily: 'monospace' }}>
                  {item.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: 'var(--text-soft)', marginBottom: 4,
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line-slate)',
  fontSize: 14, background: 'var(--surface)', color: 'var(--ink)',
  outline: 'none', cursor: 'pointer',
};

const btnPrimary: React.CSSProperties = {
  alignSelf: 'flex-end', padding: '9px 24px',
  background: 'var(--brand-teal)', color: 'var(--surface)', border: 'none',
  borderRadius: 8, fontSize: 14, fontWeight: 600,
  cursor: 'pointer',
};

const btnDanger: React.CSSProperties = {
  ...btnPrimary, background: 'var(--danger-bright)',
};
