import type { MetadataRoute } from 'next';
import { AI_BOT_TOKENS_ALLOWED, AI_BOT_TOKENS_TRAINING } from '../lib/ai-crawlers';

// Приватні розділи: кабінети, кошик, службові й персональні сторінки. Список
// один на всі групи — див. коментар нижче, чому його доводиться повторювати.
const DISALLOW = [
  '/_next/',
  '/admin/',
  '/cabinet/',
  '/account/',
  '/cart',
  '/order-success',
  '/invoice/',
  '/ru/login',
  '/login',
  '/register',
  '/ru/register',
  '/catalog',
  '/ru/catalog',
  '/api/',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },

      // ШІ-краулери прописані ЯВНО, хоча під `*` вони й так проходили.
      //
      // Причина не косметична. Робот застосовує рівно одну групу — найточнішу
      // за назвою, і решту ігнорує. Поки групи немає, будь-яке майбутнє
      // звуження `*` (умовний `Disallow: /shop` під час міграції) мовчки
      // вимкне нас із відповідей ChatGPT і Gemini разом зі звичайним пошуком.
      // Тепер доступ ШІ — окреме, свідоме рішення, а не побічний ефект
      // wildcard-правила. Ціна — список Disallow доводиться дублювати: група
      // не успадковує нічого від `*`.
      //
      // Google-Extended і Applebot-Extended тут не «ще два боти», а вимикачі:
      // без них сторінки лишаються в індексі Google, але не потрапляють у
      // відповіді Gemini й AI Overviews. Заборона нічого не економить —
      // сторінки вже публічні, — а видимість забирає повністю.
      { userAgent: AI_BOT_TOKENS_ALLOWED, allow: '/', disallow: DISALLOW },

      // Збір корпусу для навчання моделей — закрито (рішення власника).
      // Це НЕ впливає на видимість у ChatGPT і Gemini: там цитують з окремих
      // пошукових індексів (OAI-SearchBot, Googlebot + Google-Extended), яким
      // доступ лишився відкритим групою вище. Різницю між «навчальним» і
      // «пошуковим» ботом одного вендора легко втратити — див. lib/ai-crawlers.
      { userAgent: AI_BOT_TOKENS_TRAINING, disallow: '/' },
    ],
    // Домен хардкодом — так було й до появи ШІ-групи. Підставляти сюди
    // SITE_URL спокусливо, але це змінна оточення: варто їй одного разу
    // приїхати з прев'ю-деплою — і robots.txt почне вказувати пошуковикам
    // чужий sitemap. Ціна помилки незрівнянна з економією одного рядка.
    sitemap: 'https://fixline.com.ua/sitemap.xml',
  };
}
