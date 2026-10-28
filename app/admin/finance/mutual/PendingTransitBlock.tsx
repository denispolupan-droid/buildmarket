'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { showToast } from '../../../../lib/toast';
import type { PendingTransit } from '../../../../lib/accounting/transit';

function fmt(n: number) {
  return Math.abs(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Посилки, що повернулись: борг перед постачальником уже проведено при
 * відвантаженні, а доля товару невідома. Автоматично вирішити не можна: товар
 * або поїхав назад постачальнику (борг знімається), або лишився в нас (борг
 * лишається, товар на склад). Перенесено з «Кредиторки» (28.10.2026).
 */
export default function PendingTransitBlock({ items }: { items: PendingTransit[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(p: PendingTransit, decision: 'to_supplier' | 'keep') {
    if (!p.orderId) return;
    const what = decision === 'to_supplier'
      ? `Повернути постачальнику товар на ${p.amount.toFixed(2)} ₴? Борг буде знято.`
      : `Лишити товар на ${p.amount.toFixed(2)} ₴ у себе? Він стане на склад, борг лишиться.`;
    if (!confirm(what)) return;
    setBusy(p.docId);
    try {
      const res = await fetch(`/api/admin/orders/${p.orderId}/transit-resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, doc_id: p.docId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(decision === 'to_supplier'
          ? `Борг знято на ${Number(data.amount ?? 0).toFixed(2)} ₴`
          : `Товар оприбутковано на склад на ${Number(data.amount ?? 0).toFixed(2)} ₴`, 'success');
        router.refresh();
      } else {
        showToast(data.error ?? 'Не вдалося провести рішення', 'error');
      }
    } catch {
      showToast('Не вдалося провести рішення', 'error');
    }
    setBusy(null);
  }

  if (!items.length) return null;

  const btn: React.CSSProperties = {
    padding: '5px 10px', borderRadius: '7px', border: '1px solid var(--border)',
    background: 'var(--bg-card)', color: 'var(--text-secondary)',
    fontSize: '12px', fontWeight: 700, cursor: 'pointer',
  };

  return (
    <div className="fin-card" style={{ marginBottom: '12px', padding: '10px 18px', borderLeft: '3px solid #B45309' }}>
      <div style={{ fontSize: '13px', fontWeight: 800, color: '#B45309' }}>
        Повернулись — потрібне рішення: {items.length}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 8px' }}>
        Замовлення скасовано, а борг перед постачальником уже проведено при відвантаженні.
        Скажіть, куди подівся товар — інакше борг висітиме далі.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map(p => (
          <div key={p.docId} style={{
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
            padding: '6px 10px', borderRadius: '8px', background: 'var(--bg-soft)', fontSize: '12.5px',
          }}>
            <span style={{ color: 'var(--text-muted)', minWidth: '78px' }}>
              {p.docDate ? p.docDate.slice(0, 10).split('-').reverse().join('.') : '—'}
            </span>
            <span style={{ fontWeight: 700 }}>
              {p.orderNumber ? (
                // Нова вкладка навмисно: рішення ухвалюють, подивившись склад
                // замовлення, і повертатись треба сюди ж, до кнопок.
                <Link href={`/admin?status=&q=${p.orderNumber}`} target="_blank"
                  style={{ color: 'var(--brand-blue)', textDecoration: 'none' }}>
                  Замовлення #{p.orderNumber}
                </Link>
              ) : (p.docNumber ?? '—')}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {p.suppliers.map(s => s.name).join(', ') || '—'}
              {p.trackingNumber ? ` · ТТН ${p.trackingNumber}` : ''}
            </span>
            <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#B45309', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(p.amount)} ₴
            </span>
            <button onClick={() => decide(p, 'to_supplier')} disabled={busy === p.docId} style={btn}>Повернули постачальнику</button>
            <button onClick={() => decide(p, 'keep')} disabled={busy === p.docId} style={btn}>Лишили собі</button>
          </div>
        ))}
      </div>
    </div>
  );
}
