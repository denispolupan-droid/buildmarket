/**
 * Код ЄДРПОУ / ІПН у вільному тексті (коментар покупця, поле «Компанія») —
 * чиста частина без мережі: її читає й картка замовлення в браузері.
 * Пошук назви за кодом — lib/company-lookup (сервер, Нова Пошта).
 */

export type TaxCodeHit = { code: string; nameHint: string | null };

const KEYWORDS = /(єдрпоу|едрпоу|edrpou|іпн|инн|рнокпп|код|тов\b|тзов|фоп|пп\b|ат\b|прат|безнал|рахун|счет|счёт)/i;

/**
 * Код ЄДРПОУ (8 цифр) чи ІПН ФОП (10 цифр) у вільному тексті. Телефони
 * відсікаємо: 10 цифр з «0» на початку, 12 з «380», цифри з дужками/дефісами
 * поруч (+38 (095) 634-80-67). Кілька кандидатів — беремо той, що ближче до
 * ключових слів (ЄДРПОУ, ТОВ, безнал…).
 */
export function extractTaxCode(text: string | null | undefined): TaxCodeHit | null {
  const s = String(text ?? '');
  if (!s.trim()) return null;
  const hits: { code: string; idx: number; score: number; kw: boolean }[] = [];
  for (const m of s.matchAll(/(?<![\d+()\-])(\d{8}|\d{10})(?![\d()\-])/g)) {
    const code = m[1];
    if (code.length === 10 && code.startsWith('0')) continue;   // телефон 0XXXXXXXXX
    const idx = m.index ?? 0;
    const around = s.slice(Math.max(0, idx - 80), idx + code.length + 20);
    const kw = KEYWORDS.test(around);
    hits.push({ code, idx, kw, score: (kw ? 2 : 0) + (code.length === 8 ? 1 : 0) });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const best = hits[0];
  if (!best.kw && hits.length > 1) return null;                  // кілька «голих» чисел — не вгадуємо
  return { code: best.code, nameHint: nameNear(s, best.idx) };
}

/** Назва поруч із кодом: «…» або ТОВ/ФОП/ПП … до коду. */
function nameNear(s: string, idx: number): string | null {
  const before = s.slice(Math.max(0, idx - 160), idx);
  const q = before.match(/[«"„“]([^«»"„“”]{2,120})[»"”]\s*[,;:–—-]?\s*(?:код\s*(?:єдрпоу|едрпоу)?\s*[:№]?\s*)?$/i);
  const form = before.match(/((?:товариство з обмеженою відповідальністю|тов|тзов|фоп|пп|прат|ат)\b[^\n]{0,120}?)\s*[,;:–—-]?\s*(?:код\s*(?:єдрпоу|едрпоу)?\s*[:№]?\s*)?$/i);
  const raw = form?.[1] ?? (q ? `«${q[1]}»` : null);
  return raw ? raw.replace(/\s+/g, ' ').trim() : null;
}

/** Код → лише цифри, 8 або 10; інакше null. */
export function normalizeCompanyCode(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length === 8 || d.length === 10 ? d : null;
}
