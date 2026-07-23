'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { showToast } from '../../../../lib/toast';

const ACCOUNTS: { value: string; label: string }[] = [
  { value: 'bank',    label: '🏦 Монобанк' },
  { value: 'novapay', label: '💜 НоваПей' },
  { value: 'cash',    label: '💵 Каса' },
];

export default function AddTransferButton() {
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [from, setFrom]     = useState('novapay');
  const [to, setTo]         = useState('bank');
  const [amount, setAmount] = useState('');
  const [note, setNote]     = useState('');
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function submit() {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { showToast('Вкажіть коректну суму', 'error'); return; }
    if (from === to) { showToast('Рахунки мають відрізнятися', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/finance/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, amount: amt, business_date: date, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('Переказ збережено', 'success');
        setOpen(false); setAmount(''); setNote('');
        router.refresh();
      } else {
        showToast(data.error ?? 'Помилка', 'error');
      }
    } catch { showToast('Мережева помилка', 'error'); }
    setSaving(false);
  }

  const inp: React.CSSProperties = {
    height: '34px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px',
    fontSize: '13px', outline: 'none', background: 'var(--bg-soft)', color: 'var(--text-primary)', boxSizing: 'border-box',
  };

  return (
    <div>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '36px', padding: '0 16px', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700, border: '1px solid var(--border)', cursor: 'pointer' }}>
        <ArrowLeftRight size={14} /> Переказ між рахунками
      </button>

      {open && (
        <div style={{ marginTop: '12px', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Звідки</label>
            <select value={from} onChange={e => setFrom(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {ACCOUNTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Куди</label>
            <select value={to} onChange={e => setTo(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {ACCOUNTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Сума, ₴</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" style={{ ...inp, width: '110px', fontWeight: 700 }} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Примітка</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="необов'язково" style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Дата</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
          </div>
          <button onClick={submit} disabled={saving}
            style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Зберігаємо…' : 'Провести переказ'}
          </button>
        </div>
      )}
    </div>
  );
}
