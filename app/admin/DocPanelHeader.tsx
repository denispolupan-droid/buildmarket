'use client';

import { useState, useEffect, useCallback } from 'react';
import { Minus, X, Square, Copy } from 'lucide-react';

const KEY = 'admin_doc_panel_maximized';

/**
 * Ширина панелі документа — вибір користувача, спільний для всіх типів
 * документів і збережений між сесіями. До цього кожна модалка мала свою
 * зашиту ширину (74vw, 65vw, на всю сторону), і перехід між приходом і
 * замовленням постачальнику виглядав як стрибок.
 *
 * Повертає [maximized, toggle] — клас `max` вішається на .doc-panel.
 */
export function useDocPanelSize(): [boolean, () => void] {
  const [maximized, setMaximized] = useState(false);

  // localStorage читаємо після монтування: на сервері його немає, а різниця
  // між серверним і першим клієнтським рендером зламала б гідратацію.
  useEffect(() => {
    try { setMaximized(localStorage.getItem(KEY) === '1'); } catch { /* приватний режим */ }
  }, []);

  const toggle = useCallback(() => {
    setMaximized(prev => {
      const next = !prev;
      try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return [maximized, toggle];
}

/** Шапка панелі: назва, підпис і три кнопки — згорнути / розгорнути / закрити. */
export default function DocPanelHeader({ title, subtitle, maximized, onToggleSize, onMinimize, onClose }: {
  title:         React.ReactNode;
  subtitle?:     React.ReactNode;
  maximized:     boolean;
  onToggleSize:  () => void;
  onMinimize:    () => void;
  onClose:       () => void;
}) {
  return (
    <div className="doc-panel-head">
      <div style={{ minWidth: 0 }}>
        <div className="doc-panel-title">{title}</div>
        {subtitle && <div className="doc-panel-sub">{subtitle}</div>}
      </div>
      <div className="doc-panel-btns">
        <button onClick={onMinimize} title="Згорнути" className="doc-panel-btn">
          <Minus size={17} />
        </button>
        <button
          onClick={onToggleSize}
          title={maximized ? 'Зменшити вікно' : 'Розгорнути на всю ширину'}
          className="doc-panel-btn"
        >
          {maximized ? <Copy size={15} /> : <Square size={15} />}
        </button>
        <button onClick={onClose} title="Закрити" className="doc-panel-btn">
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
