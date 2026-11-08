'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Доступність «документних» панелей адмінки (нове замовлення, ЗП, прихід,
 * складський документ): вони НЕ модальні — сторінка й вкладки чернеток під ними
 * мають лишатися робочими, тому <dialog>.showModal() їм не підходить. Хук дає те,
 * чого бракувало (план адмінки, етап 3):
 *  - Escape всередині панелі → onEscape (згорнути; форма не губиться), якщо подію
 *    ще не обробив випадний список (він робить preventDefault);
 *  - фокус на перше поле при відкритті, повернення фокусу туди, звідки відкрили;
 *  - role="dialog" + aria-label ставить сама панель у розмітці.
 */
/** Спершу поле вводу (саме його чекає користувач), і лише якщо полів немає — кнопка. */
const FIELDS = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
const FOCUSABLE = `${FIELDS}, button:not([disabled]), [tabindex]:not([tabindex="-1"])`;
export function firstFocusable(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(FIELDS) ?? root.querySelector<HTMLElement>(FOCUSABLE);
}

export function useDocPanel(ref: RefObject<HTMLElement | null>, opts: { onEscape?: () => void; autoFocus?: boolean } = {}) {
  const { onEscape, autoFocus = true } = opts;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement as HTMLElement | null;
    if (autoFocus && !root.contains(document.activeElement)) {
      firstFocusable(root)?.focus({ preventScroll: true });
    }
    return () => {
      // Повертаємо фокус туди, звідки відкрили, якщо той елемент ще на сторінці
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
    // лише при монтуванні панелі
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = ref.current;
    if (!root || !onEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Відкритий нативний <select>/datalist сам закривається по Escape — не перехоплюємо
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === 'SELECT') return;
      e.preventDefault();
      onEscape();
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [ref, onEscape]);
}
