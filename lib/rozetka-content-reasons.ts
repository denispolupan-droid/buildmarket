/**
 * Класифікація причин відмови модерації Rozetka — окремим модулем, бо її
 * використовує і сервер, і клієнтський розділ адмінки. Тримати її поруч із
 * rozetka-content.ts не можна: той тягне rozetka-api зі службовим ключем, а
 * такому в браузерному бандлі не місце.
 *
 * Формулювання — дослівні з кабінету (GET /goods/all → blocked_reason,
 * GET /goods/changes → changes.reasons).
 */

/**
 * Що з причиною можна зробити.
 *   text  — наш текст: перегенерувати опис і чекати нової заявки (кнопка в адмінці);
 *   chars — характеристики: генеруються, але значення варто переглянути очима;
 *   photo — потрібне інше зображення, кодом не вирішується;
 *   other — читати руками.
 */
export type FixKind = 'text' | 'chars' | 'photo' | 'other';

export function classifyReason(title: string): FixKind {
  const t = title.toLowerCase();
  if (t.includes('фото')) return 'photo';
  if (t.includes('характеристик')) return 'chars';
  if (t.includes('опис') || t.includes('стоп-с') || t.includes('стороннього ресурсу')) return 'text';
  return 'other';
}

/** Чи лікується причина кнопкою «перегенерувати опис». */
export function isAutoFixable(title: string): boolean {
  return classifyReason(title) === 'text';
}
