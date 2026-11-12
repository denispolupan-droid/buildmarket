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

// ── Націнки нового товару ────────────────────────────────────────────────────

export type MarkupRow = { prom_markup_pct: number | string | null; rozetka_markup_pct: number | string | null };
export type ProposedMarkups = {
  prom_markup_pct: number | null; rozetka_markup_pct: number | null; epicentr_markup_pct: number | null;
  source: 'sibling' | 'category' | 'none';
};

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 100) / 100;
}

/**
 * Націнки для нової картки. У категоріях націнки Prom і Епіцентру ПОРОЖНІ (є лише
 * Rozetka), ціна там тримається на націнці товару — без неї новий товар ішов на
 * Prom/Епіцентр за «вхід + комісія», без прибутку (12.11.2026: 3 такі товари).
 * Беремо як у лінійки (sibling), інакше медіану по категорії. Епіцентр = Prom —
 * рішення власника 11.11.2026 («наценка як на Prom»).
 */
export function proposeMarkups(sibling: MarkupRow | null, neighbours: MarkupRow[]): ProposedMarkups {
  const sp = num(sibling?.prom_markup_pct), sr = num(sibling?.rozetka_markup_pct);
  if (sp != null || sr != null) return { prom_markup_pct: sp, rozetka_markup_pct: sr, epicentr_markup_pct: sp, source: 'sibling' };
  const p = median(neighbours.map(n => num(n.prom_markup_pct)).filter((v): v is number => v != null));
  const r = median(neighbours.map(n => num(n.rozetka_markup_pct)).filter((v): v is number => v != null));
  if (p == null && r == null) return { prom_markup_pct: null, rozetka_markup_pct: null, epicentr_markup_pct: null, source: 'none' };
  return { prom_markup_pct: p, rozetka_markup_pct: r, epicentr_markup_pct: p, source: 'category' };
}

/** «230x55x55», «230 × 55 × 55 мм» → [230, 55, 55] (мм); інакше null. */
export function parsePackageMm(raw: string | null | undefined): [number, number, number] | null {
  const n = (raw ?? '').replace(/,/g, '.').match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (n.length !== 3 || n.some(v => !(v > 0 && v <= 5000))) return null;
  return n.map(v => Math.round(v)) as [number, number, number];
}
