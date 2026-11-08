'use client';

import { useEffect, useId, useRef, type ReactNode, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { firstFocusable } from './useDocPanel';

/**
 * Модалка адмінки на нативному <dialog> (showModal):
 *  - верхній шар браузера — без гонки z-index між модалками;
 *  - Escape і клік по підкладці закривають (якщо dismissible);
 *  - фокус лишається всередині, сторінка під модалкою інертна;
 *  - монтується лише коли open — стан усередині скидається при закритті,
 *    як у колишніх модалках на position: fixed.
 *
 * Тости й підтвердження теж у верхньому шарі (ToastProvider, ConfirmProvider),
 * тож їх видно поверх будь-якої модалки.
 */
export type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Заголовок у шапці з хрестиком. Без нього шапки немає — розмітку дає children. */
  title?: ReactNode;
  /** Ширина картки (px або CSS-рядок); на телефоні обмежується шириною екрана. */
  width?: number | string;
  /** Escape / клік повз картку закривають модалку. false — для форм, де втрата вводу болить. */
  dismissible?: boolean;
  /** Кнопки внизу (вирівняні праворуч). */
  footer?: ReactNode;
  /** Відступи вмісту; за замовчуванням 20px. 0 — вміст сам керує відступами. */
  padding?: number | string;
  children: ReactNode;
  style?: CSSProperties;
  'aria-label'?: string;
};

export function Modal(props: ModalProps) {
  if (!props.open) return null;
  return <ModalDialog {...props} />;
}

function ModalDialog({ onClose, title, width = 480, dismissible = true, footer, padding = 20, children, style, ...rest }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  const titleId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    // showModal() ставить фокус на перший фокусований елемент — це хрестик у шапці.
    // Користувачу потрібне перше поле форми (або перша кнопка в тілі/підвалі):
    // фокус повертається туди, звідки відкрили, сам <dialog> при close().
    const content = dlg.querySelector<HTMLElement>('.ui-modal-content');
    const foot = dlg.querySelector<HTMLElement>('.ui-modal-foot');
    const first = (content && firstFocusable(content)) ?? (foot && firstFocusable(foot)) ?? null;
    first?.focus({ preventScroll: true });
    window.dispatchEvent(new Event('ui-modal-open'));
    return () => { if (dlg.open) dlg.close(); };
  }, []);

  const hasTextTitle = title !== undefined && title !== null;
  return (
    <dialog
      ref={ref}
      className="ui-modal"
      aria-labelledby={hasTextTitle && !rest['aria-label'] ? titleId : undefined}
      aria-label={rest['aria-label']}
      style={{ width: typeof width === 'number' ? `${width}px` : width, ...style }}
      onCancel={e => { e.preventDefault(); if (dismissible) closeRef.current(); }}
      // Закриваємо лише якщо і натискання, і відпускання — на підкладці: інакше
      // виділення тексту мишею, відпущене поза карткою, закривало б форму.
      onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={e => {
        if (dismissible && downOnBackdrop.current && e.target === e.currentTarget) closeRef.current();
        downOnBackdrop.current = false;
      }}
    >
      {title !== undefined && (
        <div className="ui-modal-head">
          <div className="ui-modal-title" id={titleId}>{title}</div>
          <button type="button" className="ui-modal-x" onClick={() => closeRef.current()} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>
      )}
      <div className="ui-modal-content" style={{ padding }}>{children}</div>
      {footer && <div className="ui-modal-foot">{footer}</div>}
    </dialog>
  );
}
