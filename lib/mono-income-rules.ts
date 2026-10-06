/**
 * Надходження на Mono, які НЕ оплата замовлення і не переказ між своїми рахунками:
 * компенсації й повернення витрат (НП відшкодувала розбитий товар за претензією,
 * повернення переплати перевізнику, повернення податку тощо). Проводяться як
 * ЗМЕНШЕННЯ відповідної статті витрат: DR bank / CR <стаття>[сторона] — у P&L це той
 * самий кошик, що й витрата, яку компенсують (profit-rules: logistics/expense → opex).
 *
 * Категорія з екрана «Банк» кодується як income:<стаття>. Чисті правила — під тести.
 */
import type { AccountType } from './accounting/money';

/** Статті, на які можна прийняти компенсацію / повернення витрати. */
export const INCOME_ACCOUNTS = ['logistics', 'marketing', 'packaging', 'rent', 'opex', 'taxes'] as const satisfies readonly AccountType[];
export type IncomeAccount = (typeof INCOME_ACCOUNTS)[number];

export const INCOME_CATEGORY_LABEL: Record<IncomeAccount, string> = {
  logistics: 'Компенсація · логістика (НП, перевізник)',
  marketing: 'Повернення · маркетинг (реклама)',
  packaging: 'Повернення · пакування',
  rent:      'Повернення · оренда',
  opex:      'Компенсація · інше (opex)',
  taxes:     'Повернення податків / ЄСВ',
};

/** income:<стаття> → стаття, або null, якщо це не категорія надходження-компенсації. */
export function parseIncomeCategory(category: string | null | undefined): IncomeAccount | null {
  const m = /^income:([a-z_]+)$/.exec(category ?? '');
  if (!m) return null;
  return (INCOME_ACCOUNTS as readonly string[]).includes(m[1]) ? (m[1] as IncomeAccount) : null;
}

/**
 * Сторона на статті логістики: усі витрати/комісії Нової Пошти і НоваПей лежать на
 * logistics[np], тож і компенсація від них має лягти туди ж. Інакше — без сторони,
 * як ручні витрати з «Банку».
 */
export function incomePartyFor(account: IncomeAccount, counterName: string | null | undefined, comment: string | null | undefined): string | null {
  if (account !== 'logistics') return null;
  const text = `${counterName ?? ''} ${comment ?? ''}`.toLowerCase();
  return /нова пошта|novaposhta|nova poshta|новапей|novapay/.test(text) ? 'np' : null;
}
