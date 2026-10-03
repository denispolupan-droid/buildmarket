'use client';

import { useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';

type Signal = { key: string; title: string; level: 'red' | 'yellow' | 'green' | 'info'; summary: string; items: string[] };
type Run = {
  html: string;
  data: { generatedAt: string; dateHuman: string; signals: Signal[] };
  text: { headline: string; items: { level: string; text: string }[] } | null;
  costUsd: number; sent: boolean; error?: string;
};
type HistoryRow = { id: string; at: string; by: string; cost: number; error: string | null; sent: boolean; headline: string | null };

const DOT: Record<Signal['level'], string> = { red: '#DC2626', yellow: '#CA8A04', green: '#15803D', info: '#64748B' };

export default function DigestClient({ enabled: initialEnabled, history }: { enabled: boolean; history: HistoryRow[] }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [toggling, setToggling] = useState(false);
  const [busy, setBusy] = useState<'preview' | 'send' | ''>('');
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState('');

  async function go(send: boolean) {
    setBusy(send ? 'send' : 'preview'); setError('');
    try {
      const res = await fetch('/api/admin/digest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ send }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Не вдалося зібрати');
      setRun(d as Run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  async function toggle() {
    setToggling(true);
    try {
      const res = await fetch('/api/admin/digest/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !enabled }) });
      if (res.ok) setEnabled(!enabled);
    } finally {
      setToggling(false);
    }
  }

  const btn = (primary: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 16px', borderRadius: 9,
    border: primary ? 'none' : '1.5px solid var(--border)', background: primary ? '#1E3A5F' : 'var(--bg-card)',
    color: primary ? '#fff' : 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="fin-card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => go(false)} disabled={!!busy} style={btn(false)}>
          {busy === 'preview' ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={15} />} Сформувати (без відправки)
        </button>
        <button onClick={() => go(true)} disabled={!!busy} style={btn(true)}>
          {busy === 'send' ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />} Сформувати й надіслати в Telegram
        </button>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} disabled={toggling} onChange={toggle} style={{ accentColor: '#1E3A5F' }} />
          Крон увімкнено
        </label>
      </div>

      {error && <div className="fin-card" style={{ color: '#DC2626', fontSize: 13 }}>{error}</div>}

      {run && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }} className="digest-grid">
          <div className="fin-card">
            <div className="fin-card-title">Як виглядатиме в Telegram</div>
            <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              // HTML тут — наш власний рендер (lib/ops-digest-render): текст моделі вже екранований
              dangerouslySetInnerHTML={{ __html: run.html }} />
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              {run.sent ? 'Надіслано в Telegram · ' : ''}${run.costUsd.toFixed(3)}{run.error ? ` · модель не відповіла (${run.error}), текст без неї` : ''}
            </div>
          </div>
          <div className="fin-card">
            <div className="fin-card-title">Перевірки (сирі дані)</div>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {run.data.signals.map(s => (
                <div key={s.key} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span className="fin-dot" style={{ background: DOT[s.level], marginTop: 4 }} />
                    <b style={{ color: 'var(--text-primary)' }}>{s.title}</b>
                    <span style={{ color: 'var(--text-secondary)' }}>{s.summary}</span>
                  </div>
                  {s.items.length > 0 && (
                    <ul style={{ margin: '4px 0 0 20px', padding: 0, color: 'var(--text-muted)' }}>
                      {s.items.map((i, k) => <li key={k}>{i}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="fin-card">
        <div className="fin-card-title">Останні запуски</div>
        {history.length === 0 ? (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>Ще не запускався</div>
        ) : (
          <table style={{ marginTop: 10, width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <tbody>
              {history.map(h => (
                <tr key={h.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '6px 0', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{new Date(h.at).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{h.by}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{h.error ? <span style={{ color: '#DC2626' }}>{h.error}</span> : (h.headline ?? '—')}</td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{h.sent ? 'надіслано' : 'перегляд'}</td>
                  <td style={{ padding: '6px 0', whiteSpace: 'nowrap', textAlign: 'right', color: 'var(--text-muted)' }}>${h.cost.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @media (max-width: 900px){ .digest-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
