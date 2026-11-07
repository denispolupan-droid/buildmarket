/**
 * Згадування моделей товарів у тексті категорії — «Knauf Super Finish 28 кг»,
 * «Дивоцвіт G4», «Lacrysil «60 секунд»» (07.11.2026).
 *
 * Для аудиту: текст обіцяє товар, якого вже немає. Шукаємо «Бренд + до 5 слів»,
 * беремо найдовшу фразу, що цілими словами є в назві товару цього бренду
 * (без лапок і регістру; або бренд і відмітна модель окремо — «Lacrysil
 * побутова '60 секунд'»). Якщо фраза збігається лише з НЕАКТИВНИМИ товарами —
 * згадування «мертве». Збігу немає взагалі — нічого не кажемо: це опис
 * («Ceresit для ванної»), а не назва моделі.
 */

export type MentionProduct = { name: string | null; brand: string | null; active: boolean };

const norm = (s: string) => s.toLowerCase().replace(/[«»"“”„']/g, '').replace(/[’ʼ`]/g, "'").replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (hay: string, needle: string) => !!needle && new RegExp(`(?<![\\p{L}\\p{N}])${esc(needle)}(?![\\p{L}\\p{N}])`, 'u').test(hay);
const STOP_END = new Set(['і', 'й', 'та', 'або', 'для', 'в', 'у', 'на', 'з', 'із', 'зі', 'до', 'по', 'и', 'или', 'с', 'со', 'от', 'під', 'над', '—', '–', '-']);
const STOP_START = new Set(['на', 'з', 'із', 'по', 'від', 'у', 'в', 'і', 'та', 'и', 'або']);
const UNIT_END = /\s(кг|г|л|мл|м|м²|шт|см|мм)$/;

/** Фрази-моделі в тексті, які збігаються лише з неактивними товарами. */
export function goneModelMentions(text: string, products: MentionProduct[]): string[] {
  const clean = text.replace(/\{[^}]*\}/g, ' ').replace(/\]\([^)\s]+\)/g, ']').replace(/[[\]]/g, '');
  const byBrand = new Map<string, MentionProduct[]>();
  for (const p of products) {
    const b = (p.brand ?? '').trim();
    if (b && b.toLowerCase() !== 'сталь') byBrand.set(b, [...(byBrand.get(b) ?? []), p]);
  }
  const brands = [...byBrand.keys()].sort((a, b) => b.length - a.length);
  const out = new Map<string, number>(); // фраза → позиція в тексті (видаємо в порядку тексту)
  for (const brand of brands) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(brand)}((?:\\s+(?:[^\\s,;:()—–.!?]|[,:.](?=\\d))+){0,5})`, 'giu');
    for (const m of clean.matchAll(re)) {
      const brandText = m[0].slice(0, brand.length);
      const tokens = (m[1] ?? '').trim().split(/\s+/).filter(Boolean);
      if (!tokens.length || STOP_START.has(tokens[0].toLowerCase())) continue;
      for (let k = tokens.length; k >= 1; k--) {
        const tail = tokens.slice(0, k);
        if (STOP_END.has(tail[k - 1].toLowerCase().replace(/[«»"“”„]/g, ''))) continue;
        const phrase = `${brandText} ${tail.join(' ')}`;
        if ((phrase.match(/«/g) ?? []).length !== (phrase.match(/»/g) ?? []).length) continue;
        const n = norm(phrase), tailN = norm(tail.join(' ')), brandN = norm(brand);
        const distinctive = /\p{L}/u.test(tailN) && (/\d/.test(tailN) || /[«"“']/.test(tail.join(' '))) && tailN.length >= 3 && !UNIT_END.test(` ${tailN}`);
        const hits = byBrand.get(brand)!.filter(p => {
          const nm = norm(p.name ?? '');
          return hasWord(nm, n) || (distinctive && hasWord(nm, brandN) && hasWord(nm, tailN));
        });
        if (!hits.length) continue;
        const key = phrase.replace(/[,;:]+$/, '');
        if (!hits.some(p => p.active) && !out.has(key)) out.set(key, m.index ?? 0);
        break;
      }
    }
  }
  return [...out].sort((a, b) => a[1] - b[1]).map(([p]) => p);
}
