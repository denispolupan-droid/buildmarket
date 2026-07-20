'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { showToast } from '../../../lib/toast';

const OPTIONS = [5, 10, 15, 30, 60];

type Props = {
  initialMinutes: number;
};

export default function MarketplaceSyncSettings({ initialMinutes }: Props) {
  const [minutes, setMinutes] = useState(OPTIONS.includes(initialMinutes) ? initialMinutes : 15);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      const res = await fetch('/api/admin/settings/sync-interval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
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
    <div style={{ marginTop: '32px', padding: '20px 24px', background: 'var(--bg-soft)', borderRadius: '12px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <RefreshCw size={16} color="var(--brand-blue)" />
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Синхронізація маркетплейсів
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '13px', color: 'var(--text-secondary)', flexShrink: 0 }}>
          Підтягувати замовлення Rozetka / Prom кожні
        </label>
        <select
          value={minutes}
          onChange={e => { setMinutes(parseInt(e.target.value, 10)); setSaved(false); }}
          style={{
            height: '34px', padding: '0 10px', border: '1.5px solid var(--border)',
            borderRadius: '8px', fontSize: '14px', fontWeight: 600,
            background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer',
          }}
        >
          {OPTIONS.map(o => (
            <option key={o} value={o}>{o === 60 ? '1 год' : `${o} хв`}</option>
          ))}
        </select>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            height: '34px', padding: '0 16px', borderRadius: '8px', border: 'none',
            background: saved ? '#15803D' : 'var(--brand-blue)',
            color: '#fff', fontSize: '13px', fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer', transition: 'background 0.2s',
          }}
        >
          {saving ? 'Збереження…' : saved ? '✓ Збережено' : 'Зберегти'}
        </button>
      </div>

      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Замовлення з маркетплейсів тягнуться автоматично через фонове завдання (Supabase pg_cron).
        Розклад застосовується одразу. Стан завдань щодня перевіряє сторож: якщо синк «злетить»
        або зупиниться — він відновить розклад і надішле сповіщення в Telegram.
      </div>
    </div>
  );
}
