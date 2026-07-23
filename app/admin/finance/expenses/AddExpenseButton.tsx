'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { showToast } from '../../../../lib/toast';

const TYPES: { value: string; label: string }[] = [
  { value: 'opex',      label: 'Інші витрати' },
  { value: 'rent',      label: 'Оренда' },
  { value: 'salary',    label: 'Зарплата' },
  { value: 'marketing', label: 'Маркетинг' },
  { value: 'logistics', label: 'Доставка' },
  { value: 'loading',   label: 'Навантаження' },
  { value: 'customs',   label: 'Мито / брокер' },
  { value: 'packaging', label: 'Пакування' },
];

export default function AddExpenseButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('opex');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [cp, setCp] = useState('');
  const [method, setMethod] = useState<'bank' | 'cash' | 'novapay'>('bank');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function submit() {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { showToast('Вкажіть коректну суму', 'error'); return; }
    if (!desc.trim()) { showToast('Вкажіть опис витрати', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense_type: type, amount: amt, description: desc, counterparty: cp, payment_method: method, business_date: date }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Витрату збережено${data.voucher ? ` (${data.voucher})` : ''}`, 'success');
        setOpen(false);
        setAmount(''); setDesc(''); setCp('');
        router.refresh();
      } else {
        showToast(data.error ?? 'Помилка збереження', 'error');
      }
    } catch {
      showToast('Мережева помилка', 'error');
    }
    setSaving(false);
  }

  const inp: React.CSSProperties = {
    height: '34px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px',
    fontSize: '13px', outline: 'none', background: 'var(--bg-soft)', color: 'var(--text-primary)',
    boxSizing: 'border-box',
  };

  return (
    <div>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '36px', padding: '0 16px', borderRadius: '8px', background: '#B45309', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
        <Plus size={14} /> Додати витрату
      </button>

      {open && (
        <div style={{ marginTop: '12px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '12px', padding: '14px 18px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', marginBottom: '4px' }}>Тип</label>
            <select value={type} onChange={e => setType(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', marginBottom: '4px' }}>Сума, ₴</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" style={{ ...inp, width: '110px', fontWeight: 700 }} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', marginBottom: '4px' }}>Опис</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="напр., оренда складу за липень" style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', marginBottom: '4px' }}>Контрагент</label>
            <input value={cp} onChange={e => setCp(e.target.value)} placeholder="необов'язково" style={{ ...inp, width: '160px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', marginBottom: '4px' }}>Оплата</label>
            <select value={method} onChange={e => setMethod(e.target.value as 'bank' | 'cash' | 'novapay')} style={{ ...inp, cursor: 'pointer' }}>
              <option value="bank">🏦 Монобанк</option>
              <option value="novapay">💜 НоваПей</option>
              <option value="cash">💵 Готівка (РКО)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', marginBottom: '4px' }}>Дата</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
          </div>
          <button onClick={submit} disabled={saving}
            style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#B45309', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Зберігаємо…' : 'Зберегти'}
          </button>
        </div>
      )}
    </div>
  );
}
