'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { showToast } from '../../../lib/toast';

type Props = {
  initialTtlDays: number;
};

export default function ReservationSettings({ initialTtlDays }: Props) {
  const [ttl,     setTtl]     = useState(String(initialTtlDays));
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  async function handleSave() {
    const n = parseInt(ttl, 10);
    if (isNaN(n) || n < 1 || n > 365) {
      showToast('Введіть число від 1 до 365', 'error');
      setError('Введіть число від 1 до 365');
      return;
    }
    setSaving(true); setSaved(false); setError('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_ttl_days: String(n) }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Помилка');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Помилка збереження', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '20px 24px', background: 'var(--bg-soft)', borderRadius: '12px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Clock size={16} color="var(--brand-blue)" />
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Резервування товару
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '13px', color: 'var(--text-secondary)', flexShrink: 0 }}>
          Термін зберігання резерву
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            min={1}
            max={365}
            value={ttl}
            onChange={e => { setTtl(e.target.value); setSaved(false); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            style={{
              width: '72px', height: '34px', padding: '0 10px',
              border: `1.5px solid ${error ? '#DC2626' : 'var(--border)'}`,
              borderRadius: '8px', fontSize: '14px', fontWeight: 600,
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              textAlign: 'center',
            }}
          />
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flexShrink: 0 }}>
            дн.
          </span>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            height: '34px', padding: '0 16px', borderRadius: '8px', border: 'none',
            background: saved ? '#15803D' : 'var(--brand-blue)',
            color: '#fff', fontSize: '13px', fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'Збереження…' : saved ? '✓ Збережено' : 'Зберегти'}
        </button>
      </div>

      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Після резервування товар блокується на вказану кількість днів. Прострочені резерви
        знімаються автоматично щогодини — товар повертається в доступний залишок.
      </div>
    </div>
  );
}
