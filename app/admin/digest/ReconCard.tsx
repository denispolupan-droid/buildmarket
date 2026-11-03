'use client';

import { useState } from 'react';
import { Loader2, Scale, Send, Wrench } from 'lucide-react';

type Fix = { id: string; label: string; detail: string; amount: number | null };
type Finding = { key: string; area: string; level: 'red' | 'yellow' | 'green' | 'info'; title: string; detail: string; items: string[]; fixes?: Fix[] };

/** Виправлення в один клік: перше натискання — показати, що буде проведено; друге — провести. */
function FixRow({ fix, onDone }: { fix: Fix; onDone: (id: string) => void }) {
  const [stage, setStage] = useState<'idle' | 'confirm' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  async function apply() {
    setStage('busy');
    try {
      const res = await fetch('/api/admin/recon/fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: fix.id }) });
      const d = await res.json();
      setMsg(d.message ?? d.error ?? '');
      setStage(res.ok && d.ok ? 'done' : 'error');
      if (res.ok && d.ok) onDone(fix.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e)); setStage('error');
    }
  }
  const small = (primary: boolean): React.CSSProperties => ({
    height: 26, padding: '0 10px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: primary ? 'none' : '1.5px solid var(--border)', background: primary ? 'var(--navy)' : 'var(--bg-card)', color: primary ? '#fff' : 'var(--text-secondary)',
  });
  return (
    <div style={{ marginLeft: 16, marginTop: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-secondary, rgba(100,116,139,.07))' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Wrench size={13} style={{ color: 'var(--text-muted)' }} />
        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fix.label}</span>
        <span style={{ flex: 1 }} />
        {stage === 'idle' && <button style={small(false)} onClick={() => setStage('confirm')}>Виправити…</button>}
        {stage === 'confirm' && <>
          <button style={small(true)} onClick={apply}>Підтвердити</button>
          <button style={small(false)} onClick={() => setStage('idle')}>Скасувати</button>
        </>}
        {stage === 'busy' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
        {stage === 'done' && <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>✓ готово</span>}
      </div>
      {(stage === 'confirm' || stage === 'idle') && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{fix.detail}</div>}
      {(stage === 'done' || stage === 'error') && msg && <div style={{ color: stage === 'error' ? 'var(--color-danger)' : 'var(--text-muted)', marginTop: 2 }}>{msg}</div>}
    </div>
  );
}
const DOT: Record<Finding['level'], string> = { red: '#DC2626', yellow: '#CA8A04', green: '#15803D', info: '#64748B' };
const ORDER = ['red', 'yellow', 'info', 'green'];

/**
 * Звірка з маркетплейсами й рахунками (агент mp_recon, lib/recon/run): щопонеділка
 * в Telegram; тут — ручний запуск, результат і виправлення в один клік (агент лише
 * пропонує; проводить людина другим натисканням «Підтвердити»).
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
    border: primary ? 'none' : '1.5px solid var(--border)', background: primary ? 'var(--navy)' : 'var(--bg-card)',
    color: primary ? '#fff' : 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
  });

  return (
    <div className="fin-card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800, color: 'var(--text-primary)' }}><Scale size={16} /> Звірка з маркетплейсами й рахунками</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>щопонеділка о 07:20 · виправлення — лише за підтвердженням{at ? ` · останній запуск ${new Date(at).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => run(false)} disabled={!!busy} style={btn(false)}>{busy === 'view' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Scale size={14} />} Звірити зараз</button>
        <button onClick={() => run(true)} disabled={!!busy} style={btn(true)}>{busy === 'send' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} І надіслати в Telegram</button>
      </div>
      {error && <div style={{ color: 'var(--color-danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}
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
              {(f.fixes ?? []).map(x => <FixRow key={x.id} fix={x} onDone={id => { if (id === 'np-refresh') void run(false); }} />)}
            </div>
          ))}
        </div>
      )}
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
