/** Відмінок іменника після числа (uk/ru): 1 товар, 2 товари, 5 товарів. */
export function slavicPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «товар / товари / товарів» (uk) або «товар / товара / товаров» (ru). */
export const goodsWord = (n: number, lang: 'uk' | 'ru') =>
  lang === 'ru' ? slavicPlural(n, 'товар', 'товара', 'товаров') : slavicPlural(n, 'товар', 'товари', 'товарів');
