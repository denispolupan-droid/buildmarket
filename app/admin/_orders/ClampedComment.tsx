'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Знімок статусу в кабінеті Rozetka — його оновлює крон синку замовлень.
 * Наш статус змінюється тільки штатним роутом (резерви, документи), тож плашка
 * лише показує, що менеджер уже зробив у кабінеті, і нічого не перемикає.
 */
/** Коментар покупця в блоці «Оплата»: затиснутий до 4 рядків, щоб не розтягував
 *  картки; коли текст реально обрізаний — кнопка «Показати весь» / «Згорнути». */
export function ClampedComment({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open && ref.current) setClamped(ref.current.scrollHeight > ref.current.clientHeight + 1);
  }, [text, open]);
  return (
    <div>
      <div ref={ref} style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', whiteSpace: 'pre-line', wordBreak: 'break-word',
        ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }) }}>
        «{text}»
      </div>
      {(clamped || open) && (
        <button onClick={() => setOpen(o => !o)}
          style={{ marginTop: '3px', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--brand-blue)' }}>
          {open ? 'Згорнути' : 'Показати весь'}
        </button>
      )}
    </div>
  );
}
