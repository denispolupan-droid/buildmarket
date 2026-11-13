/**
 * Правила контенту для ШІ-агентів — ОДНЕ джерело з валідаторами й фідами (12.11.2026).
 *
 * Навіщо. Промпти агентів писали правила прозою: «150–220 символів», «Rozetka, Prom»,
 * «якісний продукт», «купити … оптом». Потім стандарт (27.08), фіди й Епіцентр
 * (11.09) змінили правила в коді, а промпти лишились старими — агент далі
 * генерував за ними (аудит 12.11). Тепер промпти беруть числа, списки й площадки
 * звідси, а ці значення — ті самі константи, що перевіряють фіди/SEO. Змінив
 * правило в коді — агент отримає його в наступному ж запуску, без правки промпту.
 * tests/agent-prompts.test.ts перевіряє, що промпти не суперечать цим правилам.
 */

import { DESC_MAX } from './seo/snippets';
import { THIN_DESCRIPTION_CHARS } from './seo/thresholds';
import { MP_MIN_CHARS, MP_MAX_CHARS } from './marketplace-description';
import { EPICENTR_DESC_MAX } from './epicentr-content';
import { CHANNELS } from './channels';

/** Короткий опис товару/категорії (meta description) — стандарт: ≤ 160. */
export const SHORT_DESC_MAX = DESC_MAX;

/** Повний опис товару: менше — «тонкий» контент для SEO-аудиту. */
export const FULL_DESC_MIN_CHARS = THIN_DESCRIPTION_CHARS;

/** Опис для маркетплейсів (description_mp): межі нашого фіда й Епіцентру. */
export const MP_DESC_MIN = MP_MIN_CHARS;
export const MP_DESC_MAX = Math.min(MP_MAX_CHARS, EPICENTR_DESC_MAX);

/** Площадки, куди йде description_mp — з довідника каналів (новий канал з'явиться сам). */
export const MP_TARGETS: readonly string[] = CHANNELS.filter(c => c.kind === 'marketplace').map(c => c.longLabel);

/** Слова-«вода», заборонені стандартом (docs/CONTENT-STANDARD.md, «без якісний/надійний»). */
export const FILLER_WORDS: readonly string[] = ['якісний', 'надійний', 'широкий асортимент'];
export const FILLER_RE = /якісн|надійн|широк(ий|ого) асортимент/i;

/**
 * Комерційні слова в keywords: фід Prom їх викидає (ліміт полів), стандарт SEO —
 * без міст. Агент їх не генерує, щоб не марнувати місця.
 */
export const COMMERCIAL_KEYWORD_RE = /купити|купить|купіт|ціна|цена|цену|оптом|украина|україна/i;
export const CITY_KEYWORD_RE = /київ|киев|харків|харьков|дніпро|днепр|одес|львів|львов/i;

/** Абзаци з магазином/доставкою/посиланнями — за них маркетплейси блокують опис. */
export const MP_FORBIDDEN_TOPICS = 'назва магазину чи сайту (FIXLINE), доставка (Нова Пошта, Meest, Rozetka), оплата, ціни, акції, посилання, телефони, заклики «замовляйте/купуйте», знак оклику';

/** Блок для промптів: чим текст для маркетплейсів відрізняється від тексту сайту. */
export function mpRulesForPrompt(): string {
  return [
    `Текст піде у фіди: ${MP_TARGETS.join(', ')}.`,
    `Довжина ${MP_DESC_MIN}–${MP_DESC_MAX} символів.`,
    `Заборонено: ${MP_FORBIDDEN_TOPICS}.`,
  ].join(' ');
}

/** Ключові слова: чи фраза марнує місце (комерційне слово або місто). */
export function isWastedKeyword(k: string): boolean {
  return COMMERCIAL_KEYWORD_RE.test(k) || CITY_KEYWORD_RE.test(k);
}
