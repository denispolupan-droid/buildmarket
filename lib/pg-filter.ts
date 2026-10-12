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
