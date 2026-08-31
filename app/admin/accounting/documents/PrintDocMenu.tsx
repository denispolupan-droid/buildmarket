'use client';

import { useEffect, useRef, useState } from 'react';
import { Printer, ChevronDown, FileText, Receipt, AlertTriangle } from 'lucide-react';

/**
 * Вибір друкованої форми для продажу: рахунок на оплату або видаткова.
 *
 * Два документи однієї угоди, але з різних джерел: рахунок будується із
 * ЗАМОВЛЕННЯ (його ж номер, його ж позиції, до нього прив'язана онлайн-оплата),
 * видаткова — з цього документа обліку. Поки склад не чіпали, вони збігаються;
 * після ручної правки рядків можуть розійтися — тоді попереджаємо прямо тут,
 * бо помітити це інакше можна вже тільки від клієнта.
 */
export default function PrintDocMenu({ docId, orderId, orderNumber, diverged }: {
  docId: string;
  orderId: string | null;
  orderNumber: number | null;
  diverged: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  // Немає замовлення — немає й рахунку (він будується саме з нього). Тоді
  // це звичайне посилання на видаткову, без зайвого меню з одним пунктом.
  if (!orderId) {
    return (
      <a href={`/vidatkova/${docId}`} target="_blank" rel="noopener noreferrer" style={btn}>
        <Printer size={14} /> Друк
      </a>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{ ...btn, cursor: 'pointer' }}>
        <Printer size={14} /> Друк
        {diverged && <AlertTriangle size={13} color="#B45309" />}
        <ChevronDown size={13} />
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: '40px', zIndex: 30, width: '272px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.16)', overflow: 'hidden' }}>
          <a href={`/vidatkova/${docId}`} target="_blank" rel="noopener noreferrer" style={item} onClick={() => setOpen(false)}>
            <FileText size={15} color="#1E3A5F" style={{ flexShrink: 0 }} />
            <span>
              <b style={{ display: 'block', fontSize: '13px', color: 'var(--text-primary)' }}>Видаткова накладна</b>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>За цим документом обліку</span>
            </span>
          </a>
          <a href={`/invoice/${orderId}`} target="_blank" rel="noopener noreferrer" style={{ ...item, borderTop: '1px solid var(--border-light)' }} onClick={() => setOpen(false)}>
            <Receipt size={15} color="#15803D" style={{ flexShrink: 0 }} />
            <span>
              <b style={{ display: 'block', fontSize: '13px', color: 'var(--text-primary)' }}>Рахунок на оплату</b>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                За замовленням{orderNumber ? ` №${orderNumber}` : ''}
              </span>
            </span>
          </a>

          {diverged && (
            <div style={{ padding: '9px 12px', borderTop: '1px solid var(--border-light)', background: '#FFFBEB', fontSize: '11.5px', lineHeight: 1.45, color: '#B45309' }}>
              <b>Документи розійшлися.</b> Склад накладної відрізняється від замовлення —
              рахунок надрукується зі старими позиціями. Перевірте, який із двох віддаєте клієнту.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px',
  height: '34px', padding: '0 14px', borderRadius: '8px',
  border: '1.5px solid var(--border)', background: 'var(--bg-soft)',
  color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600,
  textDecoration: 'none',
};

const item: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: '10px',
  padding: '10px 12px', textDecoration: 'none', background: 'none', border: 'none',
  width: '100%', textAlign: 'left', cursor: 'pointer',
};
