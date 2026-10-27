'use client';

// Заявка на повернення від покупця по замовленню (частковий вибір позицій).
// Створює ЧЕРНЕТКУ документа ПВ (return_in) через POST /api/admin/orders/[id]/return —
// без проводок. Проводки робляться в журналі «Фінанси → Повернення» кнопкою
// «Товар отримано», коли товар фізично в нас.

import { useEffect, useState } from 'react';
import { X, Undo2, ExternalLink } from 'lucide-react';
import { showToast } from '../../../lib/toast';
import { REASON_LABEL, STAGE_LABEL, type ReturnReason, type ReturnStage, type RefundMethod } from '../../../lib/accounting/returns-rules';

type ReturnableItem = {
  sku: string; name: string; price: number; shipped: number; returned: number; available: number;
  fulfillment_type: string | null;
};
type Existing = { id: string; doc_number: string; stage: ReturnStage; status: string };

export default function ReturnOrderModal({
  orderId, orderNumber, onClose, onDone,
}: {
  orderId: string;
  orderNumber: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [items, setItems]       = useState<ReturnableItem[] | null>(null);
  const [existing, setExisting] = useState<Existing[]>([]);
  const [isMp, setIsMp]         = useState(false);
  const [channel, setChannel]   = useState<string | null>(null);
  const [loadErr, setLoadErr]   = useState('');
  const [qty, setQty]           = useState<Record<string, number>>({});
  const [reason, setReason]     = useState<ReturnReason>('surplus');
  const [reasonText, setReasonText] = useState('');
  const [ttn, setTtn]           = useState('');
  const [mpUnaware, setMpUnaware] = useState(false);
  const [refund, setRefund]     = useState<'none' | RefundMethod>('none');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    fetch(`/api/admin/orders/${orderId}/return`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) { setLoadErr(data.error ?? 'Помилка завантаження'); return; }
        setItems(data.items ?? []);
        setExisting(data.existing ?? []);
        setIsMp(!!data.is_marketplace);
        setChannel(data.channel_code ?? null);
        setQty(Object.fromEntries((data.items ?? []).map((i: ReturnableItem) => [i.sku, 0])));
      })
      .catch(() => setLoadErr('Мережева помилка'));
  }, [orderId]);

  const selected = (items ?? []).filter(i => (qty[i.sku] ?? 0) > 0);
  const total = selected.reduce((s, i) => s + i.price * (qty[i.sku] ?? 0), 0);
  // Площадка знає про повернення → кошти покупцю повертає вона, нам нічого не повертати
  const mpRefunds = isMp && !mpUnaware;
  const hasDropship = selected.some(i => i.fulfillment_type === 'dropship');

  async function submit() {
    if (!selected.length) { showToast('Оберіть кількість до повернення', 'error'); return; }
    if (reason === 'other' && !reasonText.trim()) { showToast('Опишіть причину повернення', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map(i => ({ sku: i.sku, qty: qty[i.sku] })),
          reason, reason_text: reasonText, ttn,
          mp_unaware: isMp ? mpUnaware : false,
          refund: !mpRefunds && refund !== 'none' ? { method: refund } : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Заявка ${data.doc_number} створена — проведіть у «Фінанси → Повернення», коли товар отримано`, 'success', 7000);
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
  const lbl: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '600px', maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

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

          {existing.length > 0 && (
            <div style={{ marginBottom: '14px', padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Уже є повернення по замовленню:</span>
              {existing.map(e => (
                <a key={e.id} href={`/admin/finance/returns?id=${e.id}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E3A5F', textDecoration: 'none' }}>
                  <ExternalLink size={12} /> {e.doc_number} — {e.status === 'cancelled' ? 'скасовано' : STAGE_LABEL[e.stage]}
                </a>
              ))}
            </div>
          )}

          {items && items.length === 0 && (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>Все вже повернуто або заявлено до повернення — доступних позицій немає.</div>
          )}

          {items && items.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {items.map(i => (
                  <div key={i.sku} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px', gap: '10px', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-soft)', borderRadius: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {i.sku} · {i.price.toFixed(2)} ₴ · відвантажено {i.shipped}{i.returned > 0 ? ` · повернуто/заявлено ${i.returned}` : ''}{i.fulfillment_type === 'dropship' ? ' · дропшип' : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>макс {i.available}</div>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <span style={lbl}>Причина</span>
                  <select value={reason} onChange={e => setReason(e.target.value as ReturnReason)} style={{ ...inp, width: '100%', cursor: 'pointer' }}>
                    {(Object.keys(REASON_LABEL) as ReturnReason[]).map(k => <option key={k} value={k}>{REASON_LABEL[k]}</option>)}
                  </select>
                </div>
                <div>
                  <span style={lbl}>ТТН зворотної посилки</span>
                  <input value={ttn} onChange={e => setTtn(e.target.value)} placeholder="необов'язково" style={{ ...inp, width: '100%' }} />
                </div>
              </div>
              <input
                value={reasonText} onChange={e => setReasonText(e.target.value)}
                placeholder={reason === 'other' ? 'Опишіть причину (обов\'язково)' : 'Коментар до причини (необов\'язково)'}
                style={{ ...inp, width: '100%', marginBottom: '12px' }}
              />

              {isMp && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '10px', cursor: 'pointer', lineHeight: 1.4 }}>
                  <input type="checkbox" checked={mpUnaware} onChange={e => setMpUnaware(e.target.checked)} style={{ marginTop: '3px' }} />
                  <span>
                    Маркетплейс ({channel}) <b>не в курсі</b> повернення
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Комісія площадки не сторнується, кошти покупцю повертаємо самі. Без галочки — комісія сторнується пропорційно, а кошти покупцю повертає площадка й утримує з виплати.</div>
                  </span>
                </label>
              )}

              {!mpRefunds && (
                <div style={{ marginBottom: '10px' }}>
                  <span style={lbl}>Кошти покупцю (при отриманні товару)</span>
                  <select value={refund} onChange={e => setRefund(e.target.value as 'none' | RefundMethod)} style={{ ...inp, width: '100%', cursor: 'pointer' }}>
                    <option value="none">Не повертаємо зараз — вирішимо при отриманні</option>
                    <option value="bank">🏦 Повернути з банківського рахунку</option>
                    <option value="cash">💵 Повернути готівкою</option>
                  </select>
                </div>
              )}

              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '8px' }}>
                Створюється заявка без проводок. Коли товар приїде — у «Фінанси → Повернення» натисніть «Товар отримано»: він стане на наш склад{hasDropship ? ' (дропшиповий теж — далі його можна повернути постачальнику документом ПП)' : ''}, виручка сторнується.
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '4px' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  До повернення: <span style={{ color: '#B45309' }}>{total.toFixed(2)} ₴</span>
                </div>
                <button onClick={submit} disabled={saving || !selected.length}
                  style={{ height: '38px', padding: '0 20px', borderRadius: '9px', border: 'none', background: '#B45309', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving || !selected.length ? 'default' : 'pointer', opacity: saving || !selected.length ? 0.6 : 1 }}>
                  {saving ? 'Створюємо…' : 'Створити заявку на повернення'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
