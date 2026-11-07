import type { CategoryMeta, CategoryGuide } from '../category-descriptions';
import { brandSlug } from './slug';

/**
 * Посилання на товари й бренди в гайді категорії «Як вибрати» (07.11.2026).
 *
 * Розмітка в тексті — та сама, що для категорій: [текст](/шлях) (рендерить
 * CategoryAbout.withLinks). Тут дві речі, обидві на рендері:
 *
 *  1. Товари. У тексті посилання пишеться на АРТИКУЛ — [Ceresit CS 25](/product/1005-025):
 *     артикул стабільний, а слаг товару може змінитись. Тут він замінюється на
 *     канонічну адресу (/product/<slug>). Якщо товар знято з продажу — посилання
 *     прибирається, лишається звичайний текст (як із цінами в lib/seo/guide-prices).
 *
 *  2. Бренди. Назви брендів у тексті не розмічені — перше згадування бренду в
 *     кожному розділі стає посиланням на сторінку бренду автоматично. Лише
 *     перше: синій текст у кожному реченні читається гірше, а пошуковики не
 *     люблять перевантаження посиланнями. Бренд не чіпаємо, якщо в розділі вже
 *     є посилання з його назвою (на товар цього бренду).
 */

export type LinkProduct = { sku: string; slug?: string | null; brand?: string | null };

const LINK = /\[([^\]]+)\]\((\/[^)\s]+)\)/g;
const PRODUCT_PATH = /^\/product\/([^/?#]+)$/;

/** Бренди-звичайні слова: «Сталь» на початку речення — не бренд. Не лінкуємо. */
const SKIP_BRANDS = new Set(['сталь']);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** [текст](/product/SKU) → канонічна адреса товару або просто текст, якщо товару немає. */
export function resolveProductLinks(text: string, bySku: Map<string, LinkProduct>): string {
  return text.replace(LINK, (whole, label: string, path: string) => {
    const m = PRODUCT_PATH.exec(path);
    if (!m) return whole;
    const p = bySku.get(decodeURIComponent(m[1]));
    if (!p) return label;
    return `[${label}](/product/${p.slug || p.sku})`;
  });
}

/**
 * Перше згадування кожного бренду в розділі (масив абзаців) → посилання на
 * сторінку бренду. Згадування всередині наявних посилань і токенів {…} не чіпає.
 */
export function linkBrandsInSection(paras: string[], brands: string[]): string[] {
  const list = [...new Set(brands.map(b => b.trim()).filter(b => b.length >= 3 && !SKIP_BRANDS.has(b.toLowerCase())))]
    .sort((a, b) => b.length - a.length); // «Aqua Protect» раніше за можливе «Aqua»
  const out = [...paras];
  const linkedText = out.join('\n').match(LINK)?.map(l => l.toLowerCase()) ?? [];
  for (const brand of list) {
    const lower = brand.toLowerCase();
    // У розділі вже є посилання з цим брендом (на товар чи бренд) — другого не треба
    if (linkedText.some(l => l.includes(lower))) continue;
    // Межі слова для кирилиці: \b у JS працює лише з латиницею
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(brand)}(?![\\p{L}\\p{N}])`, 'iu');
    for (let i = 0; i < out.length; i++) {
      const replaced = replaceOutsideLinks(out[i], re, m => `[${m}](/shop/brand/${brandSlug(brand)})`);
      if (replaced !== null) { out[i] = replaced; break; }
    }
  }
  return out;
}

/** Замінює ПЕРШИЙ збіг поза [..](..) і {..}; null — збігу поза ними немає. */
function replaceOutsideLinks(text: string, re: RegExp, wrap: (m: string) => string): string | null {
  const protectedRe = /\[[^\]]+\]\([^)\s]+\)|\{[^}]*\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const parts: { s: string; free: boolean }[] = [];
  while ((m = protectedRe.exec(text))) {
    if (m.index > last) parts.push({ s: text.slice(last, m.index), free: true });
    parts.push({ s: m[0], free: false });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ s: text.slice(last), free: true });
  for (const part of parts) {
    if (!part.free) continue;
    const hit = re.exec(part.s);
    if (!hit) continue;
    part.s = part.s.slice(0, hit.index) + wrap(hit[0]) + part.s.slice(hit.index + hit[0].length);
    return parts.map(p => p.s).join('');
  }
  return null;
}

/** Гайд із живими посиланнями: товари — на канонічні адреси (або текстом), бренди — автоматично. */
export function resolveGuideLinks(meta: CategoryMeta, products: LinkProduct[]): CategoryMeta {
  if (!meta.guide) return meta;
  const bySku = new Map(products.map(p => [p.sku, p]));
  const brands = [...new Set(products.map(p => (p.brand ?? '').trim()).filter(Boolean))];
  const guide: CategoryGuide = {
    ...meta.guide,
    sections: meta.guide.sections.map(sec => ({
      ...sec,
      p: linkBrandsInSection(sec.p.map(t => resolveProductLinks(t, bySku)), brands),
    })),
  };
  return { ...meta, guide };
}
