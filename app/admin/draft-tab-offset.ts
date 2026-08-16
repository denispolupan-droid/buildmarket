'use client';

/**
 * Скільки ярликів чернеток стоїть ліворуч від нашого менеджера.
 *
 * Менеджери повідомляють один одному свою кількість подіями
 * `<тип>-drafts-changed`. Але на новій сторінці всі монтуються заново, і той,
 * хто підписався пізніше, пропускає чужий broadcast: його лічильник лишається
 * нулем, ярлики двох типів накладаються один на одного (видно після переходу
 * між сторінками з відкритими чернетками). Тому на монтуванні читаємо
 * кількість прямо з sessionStorage — того самого сховища, куди менеджери
 * пишуть свої чернетки, — а події лишаються для оновлень у межах сторінки.
 */

export const DRAFT_KEYS = {
  po:       'admin_po_drafts',
  receipt:  'admin_receipt_drafts',
  order:    'admin_order_drafts',
  stockdoc: 'admin_stockdoc_drafts',
} as const;

export function draftCount(key: string): number {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
