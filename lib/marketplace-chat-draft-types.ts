/**
 * Категорії чернеток ШІ-помічника чатів МП — спільне між сервером
 * (lib/marketplace-chat-assistant) і клієнтом адмінки. Окремий файл, бо сам
 * помічник тягне Anthropic SDK і service-role клієнт, яким у браузері не місце.
 */
export const DRAFT_CATEGORIES = [
  'availability',      // чи є товар, коли буде
  'product_question',  // характеристики, застосування, сумісність
  'price',             // ціна, знижка, опт
  'delivery',          // способи/строки/вартість доставки до відправки
  'order_status',      // де моє замовлення, ТТН, коли відправите
  'order_change',      // змінити адресу/позиції/скасувати
  'return_refund',     // повернення, обмін, гроші
  'complaint',         // пошкоджено, не те, претензія
  'other',
] as const;
export type DraftCategory = typeof DRAFT_CATEGORIES[number];

export const CATEGORY_LABELS: Record<DraftCategory, string> = {
  availability: 'Наявність',
  product_question: 'Про товар',
  price: 'Ціна',
  delivery: 'Доставка',
  order_status: 'Статус замовлення',
  order_change: 'Зміна замовлення',
  return_refund: 'Повернення',
  complaint: 'Претензія',
  other: 'Інше',
};
