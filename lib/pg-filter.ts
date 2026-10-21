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
 * «Кожне слово запиту є в одній із колонок» — спільна частина пошуку людей.
 * Слова звіряються в будь-якому порядку, кожне розкривається в корені свого
 * імені (lib/name-search), а колонки — завжди *_norm зі згорнутою орфографією.
 */
function nameWordsCond(term: string, cols: readonly string[]): string | null {
  const conds = term.split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, SEARCH_WORDS_MAX)
    .map(w => {
      const frags = nameFragments(w);
      if (!frags.length) return null;
      return `or(${frags.flatMap(f => cols.map(c => `${c}.ilike.%${f}%`)).join(',')})`;
    })
    .filter((c): c is string => c !== null);
  if (!conds.length) return null;
  return conds.length > 1 ? `and(${conds.join(',')})` : conds[0];
}

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

  const byName = nameWordsCond(term, ['contact_norm', 'company_norm']);
  if (byName) ors.push(byName);

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

/**
 * Умова PostgREST для пошуку клієнта чи партнера в таблиці customers: ім'я,
 * компанія, юридична назва, телефон у будь-якому форматі, пошта.
 *
 * Правила ті самі, що в журналі замовлень (orderSearchOr): слова в будь-якому
 * порядку, згорнута орфографія в *_norm, корені імен із lib/name-search,
 * телефон по phone_digits — усе з міграції 135.
 */
export function personSearchOr(search: string): string | null {
  const term = escapeOrTerm(search);
  if (!term) return null;
  const digits = search.replace(/\D/g, '');
  const ors: string[] = [`email.ilike.%${term}%`];

  const byName = nameWordsCond(term, ['name_norm', 'company_norm', 'legal_name_norm']);
  if (byName) ors.push(byName);

  ors.push(`phone.ilike.%${term}%`);
  if (digits.length >= 3) ors.push(`phone_digits.ilike.%${digits}%`);
  return ors.join(',');
}
