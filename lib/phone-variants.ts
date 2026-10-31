// Чисті правила номера телефону контрагента — без залежностей (під тести).
// lib/customers реекспортує їх для зворотної сумісності.

export function normalizeCustomerPhone(raw?: string | null): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('380')) return d;
  if (d.length === 10 && d.startsWith('0'))   return `38${d}`;
  if (d.length === 11 && d.startsWith('80'))  return `3${d}`;
  return null;
}

/**
 * Варіанти запису одного номера в customers.phone_digits (там лише цифри від
 * того, як номер прийшов: «380671234567», «0671234567», «80671234567»).
 * Синки маркетплейсів шукали клієнта точним `eq('phone', …)` по сирому рядку —
 * «+380…» і «380…» давали двох контрагентів (аудит 31.10.2026).
 */
export function phoneDigitVariants(raw?: string | null): string[] {
  const n = normalizeCustomerPhone(raw);
  if (!n) {
    const d = (raw ?? '').replace(/\D/g, '');
    return d ? [d] : [];
  }
  const local = n.slice(3); // 9 цифр без коду країни
  return [n, `0${local}`, `80${local}`];
}
