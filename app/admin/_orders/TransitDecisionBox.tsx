'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { showToast } from '../../../lib/toast';
import { decisionBtn } from './constants';

export function TransitDecisionBox({ orderId, orderNumber }: { orderId: string; orderNumber: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/orders/${orderId}/transit-resolve`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d?.ok) setAmount(Number(d.total) || 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, [orderId]);

  if (!amount || amount <= 0) return null;

  async function decide(decision: 'to_supplier' | 'keep') {
    const ok = confirm(decision === 'to_supplier'
      ? `Замовлення №${orderNumber}: товар на ${amount!.toFixed(2)} ₴ повернувся постачальнику?\n\nБорг перед ним буде знято.`
      : `Замовлення №${orderNumber}: товар на ${amount!.toFixed(2)} ₴ лишається в нас?\n\nВін стане на склад, борг перед постачальником лишиться.`);
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/transit-resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(decision === 'to_supplier'
          ? `Борг перед постачальником знято на ${Number(data.amount ?? 0).toFixed(2)} ₴`
          : `Товар оприбутковано на склад на ${Number(data.amount ?? 0).toFixed(2)} ₴`, 'success');
        setAmount(0);
        router.refresh();
      } else {
        showToast(data.error ?? 'Не вдалося провести рішення', 'error');
      }
    } catch {
      showToast('Не вдалося провести рішення', 'error');
    }
    setBusy(false);
  }

  return (
    <div style={{
      marginTop: '4px', padding: '7px 9px', borderRadius: '8px',
      border: '1px solid #FDE68A', background: 'var(--bg-warn)',
    }}>
      <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--color-warn)' }}>
        Товар у дорозі — {amount.toFixed(2)} ₴
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 6px' }}>
        Борг перед постачальником проведено при відвантаженні. Куди подівся товар?
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button onClick={() => decide('to_supplier')} disabled={busy}
          title="Товар поїхав назад постачальнику — борг перед ним знімається"
          style={{ ...decisionBtn, border: '1px solid #FDE68A', color: 'var(--color-warn)' }}>
          Повернули постачальнику
        </button>
        <button onClick={() => decide('keep')} disabled={busy}
          title="Товар лишається в нас — оприбуткуємо на склад, борг перед постачальником лишається"
          style={decisionBtn}>
          Лишили собі
        </button>
      </div>
    </div>
  );
}
