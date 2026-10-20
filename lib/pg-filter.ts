import { nameFragments } from './name-search';

// Sanitises a user-supplied search value before it is interpolated into a
// PostgREST `.or(...)` / `.ilike(...)` filter string. Without this a value
// containing a comma injects an extra OR condition (e.g. `x,is_active.eq.false`),
// and parens/quotes can further manipulate the filter. We strip the structural
// metacharacters; ilike wildcards (% _) are harmless and left untouched.
export function escapeOrTerm(s: string): string {
  return String(s ?? '').replace(/[,()"\\]/g, ' ').trim();
}

/** Довжина номера замовлення: РРММНННН (26101033). */
export const ORDER_NUMBER_LEN = 8;

/**
 * Умова PostgREST для пошуку замовлення за номером, набраним повністю або з
 * початку. order_number — int4, ilike на ньому не працює, тому частковий ввід
 * («261010») перетворюємо на діапазон 26101000…26101099: це той самий «починається
 * з», але по індексу. 8 цифр — точний збіг. Не цифри, довше за номер або порожнє —
 * null (нічого не додаємо в OR).
 */
export function orderNumberFilter(term: string): string | null {
  if (!/^\d+$/.test(term) || term.length > ORDER_NUMBER_LEN) return null;
  if (term.length === ORDER_NUMBER_LEN) return `order_number.eq.${term}`;
  const from = term.padEnd(ORDER_NUMBER_LEN, '0');
  const to   = term.padEnd(ORDER_NUMBER_LEN, '9');
  return `and(order_number.gte.${from},order_number.lte.${to})`;
}

/** Скільки слів запиту враховуємо: довший ввід — це вже не ім'я, а фраза. */
const SEARCH_WORDS_MAX = 4;

/**
 * Умова PostgREST для пошуку замовлення в журналі: номер (повний чи з початку),
 * № в кабінеті МП, ТТН, телефон у будь-якому форматі, ім'я, компанія, місто.
 *
 * Ім'я шукається ПОСЛІВНО, у будь-якому порядку і без огляду на написання:
 * у базі контакт записаний як прийшов із площадки («Стельмах Александр»), а
 * шукають як звикли («Олександр Стельмах»). Кожне слово має знайтись у
 * contact_norm або company_norm (міграція 134 — згорнута орфографія), причому
 * слово розкривається в корені свого імені, якщо вони різні в українській і
 * російській — див. lib/name-search. Тому «Король» і «Роман Король» звужують
 * вибірку, а випадковий збіг одного слова не витягує чужі замовлення.
 *
 * Телефон порівнюється по phone_digits (міграція 133) — колонці без
 * роздільників: у базі номер буває і «380…», і «+38 (068) 052-92-36».
 */
export function orderSearchOr(search: string): string | null {
  const term = escapeOrTerm(search);
  if (!term) return null;
  const digits = search.replace(/\D/g, '');
  const ors: string[] = [`tracking_number.ilike.%${term}%`, `delivery_city_name.ilike.%${term}%`];

  // Слово → «contact_norm або company_norm містить будь-який із варіантів»
  const wordCond = (w: string) => {
    const frags = nameFragments(w);
    if (!frags.length) return null;
    return `or(${frags.map(f => `contact_norm.ilike.%${f}%,company_norm.ilike.%${f}%`).join(',')})`;
  };
  const words = term.split(/\s+/).filter(w => w.length > 1).slice(0, SEARCH_WORDS_MAX);
  const conds = words.map(wordCond).filter((c): c is string => c !== null);
  if (conds.length > 1) ors.push(`and(${conds.join(',')})`);
  else if (conds.length === 1) ors.push(conds[0]);

  // Телефон: і як ввели (раптом формат збігся), і самими цифрами
  ors.push(`phone.ilike.%${term}%`);
  if (digits.length >= 3) ors.push(`phone_digits.ilike.%${digits}%`);

  const byNumber = orderNumberFilter(term);
  if (byNumber) ors.push(byNumber);
  // № замовлення в кабінеті маркетплейсу: обидві колонки BIGINT — лише точний збіг
  if (/^\d{4,18}$/.test(digits)) {
    ors.push(`prom_order_id.eq.${digits}`, `rozetka_order_id.eq.${digits}`);
  }
  return ors.join(',');
}
