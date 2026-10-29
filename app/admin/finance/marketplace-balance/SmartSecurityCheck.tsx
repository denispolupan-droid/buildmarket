'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Loader2, Upload } from 'lucide-react';
import { parseSecurityRows, type SmartCompare } from '../../../../lib/rozetka-security';

const fmt = (v: number) => v.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Smart Rozetka за історією гарантійного платежу. Rozetka показує Smart построчно
 * лише в цьому вивантаженні — ні в API, ні в акті його немає. Файл розбирається
 * в браузері, на сервер ідуть тільки рядки; нічого не проводиться.
 */
export default function SmartSecurityCheck() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<SmartCompare | null>(null);

  async function onFile(file: File) {
    setBusy(true); setError(''); setRes(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const rows = parseSecurityRows(sheet);
      const r = await fetch('/api/admin/finance/marketplace-balance/rozetka-security', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Не вдалося звірити');
      setRes(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const ok = res && Math.abs(res.delta) < 0.01;
  return (
    <div style={{ padding: '12px 16px', borderRadius: '10px', margin: '0 0 14px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>Smart за гарантійним платежем</span>
        {res && (
          <span style={{ fontSize: '13px', fontWeight: 800, color: ok ? '#15803D' : '#DC2626' }}>
            {ok ? '✓ сходиться' : `розходиться на ${fmt(res.delta)} ₴`}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />} Завантажити xlsx
        </button>
      </div>
      {error && <div style={{ color: '#DC2626', fontSize: '12px', marginTop: '6px' }}>{error}</div>}
      {res && (
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '6px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.55 }}>
          Rozetka зняла <b>{fmt(res.theirTotal)} ₴</b> ({res.count} списань, {res.from} — {res.to}), у нас проведено <b>{fmt(res.oursTotal)} ₴</b>.
          {res.unattributed.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              Без замовлення (сума не складається з тарифів 12/18/30 ₴):{' '}
              {res.unattributed.map(u => `${u.ts.slice(0, 10)} — ${fmt(u.amount)} ₴`).join('; ')}.
            </div>
          )}
          {!ok && <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>Різницю проводять «Операцією» як Smart-збір без замовлення.</div>}
        </div>
      )}
      {!res && !error && (
        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.5 }}>
          Кабінет Rozetka → Баланс → Гарантійний платіж → вивантажити історію. Лише там Smart видно построчно — ні в API, ні в акті його немає.
        </div>
      )}
    </div>
  );
}
