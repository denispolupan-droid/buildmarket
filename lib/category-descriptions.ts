/**
 * Типи контенту категорії. Самі тексти з 28.08.2026 живуть у БД
 * (category_content, див. lib/category-content.ts) і редагуються в адмінці
 * /admin/seo/categories/<slug>; до того лежали тут словником на ~780 КБ.
 * Файл лишився заради типів — його імпортують і клієнтські компоненти
 * (CategoryAbout, use-category-meta), тому жодних серверних залежностей тут.
 */
export type CategoryFaq = { q: string; a: string };

/** Розділ гайда «Як вибрати»: підзаголовок + абзаци; у абзацах допускаються посилання [текст](/шлях) */
export type CategoryGuideSection = { h: string; p: string[] };
export type CategoryGuide = { title: string; sections: CategoryGuideSection[] };
/** Чип «Дивіться також»: шлях без /ru (префікс додається на рендері) */
export type CategoryRelated = { href: string; label: string };

export type CategoryMeta = {
  description: string;
  seoText?: string;
  faq?: CategoryFaq[];
  blogSlug?: string;
  /** Розгорнутий гайд під листингом (350–600 слів) — див. CategoryAbout і docs/CONTENT-STANDARD.md 1.4 */
  guide?: CategoryGuide;
  related?: CategoryRelated[];
};
