/**
 * Чиста логіка агента заведення картки товару (без БД і SDK — під тести).
 * Сам агент — lib/product-card-proposer.ts.
 */

/** Бренд з відповіді моделі → бренд із каталогу (регістр/пробіли не важливі); інакше як є. */
export function matchBrand(proposed: string, known: string[]): { brand: string; isNew: boolean } {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const p = norm(proposed);
  if (!p) return { brand: '', isNew: false };
  const hit = known.find(k => norm(k) === p);
  return hit ? { brand: hit, isNew: false } : { brand: proposed.trim(), isNew: true };
}

/** Більшість булевих у сусідів (увімкнено на Епіцентрі, Smart тощо); порожньо → fallback. */
export function majority(values: (boolean | null | undefined)[], fallback: boolean): boolean {
  let yes = 0, no = 0;
  for (const v of values) { if (v === true) yes++; else if (v === false) no++; }
  if (yes + no === 0) return fallback;
  return yes >= no;
}

/** Найчастіше значення (для img_type сусідів по категорії тощо). */
export function mostCommon<T extends string>(values: (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null, bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

/**
 * Фасування у канонічному вигляді: «280 мл», «5 кг», «0,75 л» → «750 мл».
 * Повертає null, якщо не розпізнано — тоді лишаємо як написала модель.
 */
export function canonicalVolume(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(',', '.');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(мл|ml|л|l|г|g|кг|kg|шт|pcs|м|m)(?![a-zа-яіїє])/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  let unit = m[2].toLowerCase();
  if (unit === 'ml') unit = 'мл';
  if (unit === 'l') unit = 'л';
  if (unit === 'g') unit = 'г';
  if (unit === 'kg') unit = 'кг';
  if (unit === 'pcs') unit = 'шт';
  if (unit === 'm') unit = 'м';
  // Дробові літри й кілограми — у мл/г, як у решті каталогу
  if (unit === 'л' && n < 1) { n = Math.round(n * 1000); unit = 'мл'; }
  if (unit === 'кг' && n < 1) { n = Math.round(n * 1000); unit = 'г'; }
  const num = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${num} ${unit}`;
}

export type ProposalIssue = { field: string; message: string };

/**
 * Перевірки пропозиції перед показом менеджеру: без них форма приймала б
 * вигадану категорію чи назву без бренду.
 */
export function validateProposal(p: {
  name: string; brand: string; category_slug: string; volume: string;
  characteristics: { label: string; value: string }[];
}, ctx: { categorySlugs: Set<string>; requiredLabels: string[] }): ProposalIssue[] {
  const issues: ProposalIssue[] = [];
  if (!p.brand.trim()) issues.push({ field: 'brand', message: 'Бренд не визначено' });
  if (!p.name.trim()) issues.push({ field: 'name', message: 'Назва порожня' });
  else if (p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase())) {
    issues.push({ field: 'name', message: 'Назва має починатися з бренду (стандарт: «Бренд Тип Модель, фасування»)' });
  }
  if (p.volume && p.name && !p.name.toLowerCase().includes(p.volume.toLowerCase().split(' ')[0])) {
    issues.push({ field: 'name', message: `У назві немає фасування «${p.volume}»` });
  }
  if (p.category_slug && !ctx.categorySlugs.has(p.category_slug)) {
    issues.push({ field: 'category_slug', message: `Категорії «${p.category_slug}» немає в каталозі` });
  }
  if (!p.category_slug) issues.push({ field: 'category_slug', message: 'Категорію не обрано' });
  const have = new Set(p.characteristics.map(c => c.label.trim().toLowerCase()));
  const missing = ctx.requiredLabels.filter(l => !have.has(l.trim().toLowerCase()));
  if (missing.length) issues.push({ field: 'characteristics', message: `Не заповнено обовʼязкові: ${missing.join(', ')}` });
  return issues;
}
