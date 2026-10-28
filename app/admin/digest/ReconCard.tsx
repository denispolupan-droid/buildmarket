'use client';

import { useState } from 'react';
import { Loader2, Scale, Send } from 'lucide-react';

type Finding = { key: string; area: string; level: 'red' | 'yellow' | 'green' | 'info'; title: string; detail: string; items: string[] };
const DOT: Record<Finding['level'], string> = { red: '#DC2626', yellow: '#CA8A04', green: '#15803D', info: '#64748B' };
const ORDER = ['red', 'yellow', 'info', 'green'];

/**
 * Звірка з маркетплейсами й рахунками (агент mp_recon, lib/recon/run): щопонеділка
 * в Telegram; тут — ручний запуск і результат. Лише читання — нічого не проводить.
 */
export default function ReconCard({ last }: { last: { at: string; findings: Finding[] } | null }) {
  const [busy, setBusy] = useState<'' | 'view' | 'send'>('');
  const [findings, setFindings] = useState<Finding[] | null>(last?.findings ?? null);
  const [at, setAt] = useState<string | null>(last?.at ?? null);
  const [error, setError] = useState('');

  async function run(send: boolean) {
    setBusy(send ? 'send' : 'view'); setError('');
    try {
      const res = await fetch('/api/admin/recon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ send }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Не вдалося');
      setFindings(d.findings); setAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  const btn = (primary: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', borderRadius: 9,
    border: primary ? 'none' : '1.5px solid var(--border)', background: primary ? '#1E3A5F' : 'var(--bg-card)',
    color: primary ? '#fff' : 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
  });

  return (
    <div className="fin-card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800, color: 'var(--text-primary)' }}><Scale size={16} /> Звірка з маркетплейсами й рахунками</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>щопонеділка о 08:20 · лише читання{at ? ` · останній запуск ${new Date(at).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => run(false)} disabled={!!busy} style={btn(false)}>{busy === 'view' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Scale size={14} />} Звірити зараз</button>
        <button onClick={() => run(true)} disabled={!!busy} style={btn(true)}>{busy === 'send' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} І надіслати в Telegram</button>
      </div>
      {error && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{error}</div>}
      {findings && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {[...findings].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level)).map(f => (
            <div key={f.key} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span className="fin-dot" style={{ background: DOT[f.level] }} />
                <b style={{ color: 'var(--text-primary)' }}>{f.area}</b>
                <span style={{ color: 'var(--text-secondary)' }}>{f.title}</span>
              </div>
              {f.level !== 'green' && f.detail && <div style={{ color: 'var(--text-muted)', marginLeft: 16 }}>{f.detail}</div>}
              {f.level !== 'green' && f.items.length > 0 && (
                <ul style={{ margin: '4px 0 0 34px', padding: 0, color: 'var(--text-muted)' }}>{f.items.map((i, k) => <li key={k}>{i}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
      )}
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
