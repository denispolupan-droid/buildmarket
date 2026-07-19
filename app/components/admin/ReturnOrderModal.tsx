'use client';

// Оформлення повернення від покупця по замовленню (частковий вибір позицій).
// Створює документ return_in через POST /api/admin/orders/[id]/return.

import { useEffect, useState } from 'react';
import { X, Undo2 } from 'lucide-react';
import { showToast } from '../../../lib/toast';

type ReturnableItem = {
  sku: string;
  name: string;
  price: number;
  shipped: number;
  returned: number;
  available: number;
};

export default function ReturnOrderModal({
  orderId, orderNumber, onClose, onDone,
}: {
  orderId: string;
  orderNumber: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [items, setItems]       = useState<ReturnableItem[] | null>(null);
  const [loadErr, setLoadErr]   = useState('');
  const [qty, setQty]           = useState<Record<string, number>>({});
  const [refund, setRefund]     = useState(false);
  const [refundMethod, setRefundMethod] = useState<'bank' | 'cash'>('bank');
  const [reason, setReason]     = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    fetch(`/api/admin/orders/${orderId}/return`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) { setLoadErr(data.error ?? 'Помилка завантаження'); return; }
        setItems(data.items ?? []);
        setQty(Object.fromEntries((data.items ?? []).map((i: ReturnableItem) => [i.sku, 0])));
      })
      .catch(() => setLoadErr('Мережева помилка'));
  }, [orderId]);

  const selected = (items ?? []).filter(i => (qty[i.sku] ?? 0) > 0);
  const total = selected.reduce((s, i) => s + i.price * (qty[i.sku] ?? 0), 0);

  async function submit() {
    if (!selected.length) { showToast('Оберіть кількість до повернення', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map(i => ({ sku: i.sku, qty: qty[i.sku] })),
          refund: refund ? { method: refundMethod } : undefined,
          reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Повернення оформлено (${data.doc_number})${data.refunded ? ' + кошти повернуто' : ''}`, 'success');
        onDone();
        onClose();
      } else {
        showToast(data.error ?? 'Помилка оформлення повернення', 'error');
      }
    } catch {
      showToast('Мережева помилка', 'error');
    }
    setSaving(false);
  }

  const inp: React.CSSProperties = {
    height: '32px', padding: '0 8px', border: '1.5px solid var(--border)', borderRadius: '7px',
    fontSize: '13px', outline: 'none', background: 'var(--bg-soft)', color: 'var(--text-primary)',
    boxSizing: 'border-box',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '560px', maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            <Undo2 size={16} color="#B45309" /> Повернення — замовлення #{orderNumber}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {loadErr && <div style={{ fontSize: '13px', color: '#DC2626', padding: '12px 0' }}>{loadErr}</div>}
          {!items && !loadErr && <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>Завантаження…</div>}

          {items && items.length === 0 && (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>Все вже повернуто — доступних позицій немає.</div>
          )}

          {items && items.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {items.map(i => (
                  <div key={i.sku} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px', gap: '10px', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-soft)', borderRadius: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {i.sku} · {i.price.toFixed(2)} ₴ · відвантажено {i.shipped}{i.returned > 0 ? ` · повернуто ${i.returned}` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
                      макс {i.available}
                    </div>
                    <input
                      type="number" min={0} max={i.available} step={1}
                      value={qty[i.sku] ?? 0}
                      disabled={i.available === 0}
                      onChange={e => {
                        const v = Math.max(0, Math.min(i.available, Math.floor(Number(e.target.value) || 0)));
                        setQty(prev => ({ ...prev, [i.sku]: v }));
                      }}
                      style={{ ...inp, width: '100%', textAlign: 'center', fontWeight: 700 }}
                    />
                  </div>
                ))}
              </div>

              <input
                value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Причина повернення (необов'язково)"
                style={{ ...inp, width: '100%', marginBottom: '12px' }}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={refund} onChange={e => setRefund(e.target.checked)} />
                Повернути кошти покупцю
              </label>
              {refund && (
                <select value={refundMethod} onChange={e => setRefundMethod(e.target.value as 'bank' | 'cash')}
                  style={{ ...inp, marginBottom: '12px', cursor: 'pointer' }}>
                  <option value="bank">🏦 З банківського рахунку</option>
                  <option value="cash">💵 Готівкою</option>
                </select>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '4px' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  До повернення: <span style={{ color: '#B45309' }}>{total.toFixed(2)} ₴</span>
                </div>
                <button onClick={submit} disabled={saving || !selected.length}
                  style={{ height: '38px', padding: '0 20px', borderRadius: '9px', border: 'none', background: '#B45309', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving || !selected.length ? 'default' : 'pointer', opacity: saving || !selected.length ? 0.6 : 1 }}>
                  {saving ? 'Оформлюємо…' : 'Оформити повернення'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
