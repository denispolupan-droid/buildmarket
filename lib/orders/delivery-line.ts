// Адреса доставки в картці замовлення.
//
// Перевізники віддають адресу разом із містом («м. Київ (Київська обл.), №447:
// вул. Велика Васильківська, 143/2»), а місто в нас лежить ще й окремим полем.
// У рядку виходило «… · м. Київ (Київська обл.) · м. Київ (Київська обл.),
// №447: …» — місто двічі поспіль. Тут прибираємо повтор, лишаючи виділене
// місто як орієнтир і чисту адресу після нього.

/** Порівнюємо міста «на око людини»: без регістру, префіксів і пунктуації. */
function tokens(v: string): string[] {
  return v
    .toLowerCase()
    .replace(/^(м|с|смт|сщ|селище|місто)\.?\s+/u, '')
    .replace(/[«»"'().,:;–—-]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
}

/**
 * Прибирає з початку адреси назву міста, якщо вона там повторюється.
 * Повертає адресу без міста; коли повтору немає — адресу як була.
 */
export function stripCityPrefix(address: string | null | undefined, city: string | null | undefined): string {
  const addr = (address ?? '').trim();
  const cityName = (city ?? '').trim();
  if (!addr || !cityName) return addr;

  const addrTokens = tokens(addr);
  const cityTokens = tokens(cityName);
  if (!cityTokens.length || cityTokens.length >= addrTokens.length) return addr;
  // Порівнюємо словами, а не префіксом рядка: інакше «Київська, 12» вважалось
  // би містом «Київ» із адресою «ська, 12».
  if (!cityTokens.every((t, i) => addrTokens[i] === t)) return addr;

  // Ріжемо по НАЙДОВШОМУ префіксу, що дає рівно назву міста, — так із рядка
  // піде і закриваюча дужка «м. Київ (Київська обл.)», а не тільки «…обл».
  let cut = 0;
  for (let i = addr.length; i > 0; i--) {
    const prefix = tokens(addr.slice(0, i));
    if (prefix.length === cityTokens.length && prefix.every((t, k) => t === cityTokens[k])) { cut = i; break; }
  }
  if (!cut) return addr;

  const rest = addr.slice(cut).replace(/^[\s,;:·—–-]+/u, '').trim();
  // Порожній залишок означає, що адреса була самим лише містом — тоді краще
  // лишити як є, ніж показати пусте місце.
  return rest || addr;
}
