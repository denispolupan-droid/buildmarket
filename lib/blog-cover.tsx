import { ImageResponse } from 'next/og';
import { uploadToR2 } from './r2';

/**
 * Обкладинка статті блогу — малюється при створенні статті й лягає в R2.
 *
 * Раніше обкладинки були PNG у public/blog/covers, які треба було згенерувати
 * скриптом і закомітити — тож кожна нова стаття виходила без заставки, поки
 * хтось про це не згадає. Тепер картинка народжується разом зі статтею.
 *
 * Рендер — next/og (satori), а не sharp: перевірено, що на Vercel він коректно
 * малює кирилицю (укр «ї», «ґ» включно), тоді як sharp малює текст системними
 * шрифтами, яких у рантаймі може не бути.
 */

export type CoverPalette = { color1: string; color2: string; accent: string };

// Ті самі поєднання, що в першій партії обкладинок — щоб нові не вибивалися
const PALETTES: CoverPalette[] = [
  { color1: '#1E293B', color2: '#1e3a5f', accent: '#60A5FA' },
  { color1: '#0f2744', color2: '#1a3a6b', accent: '#38BDF8' },
  { color1: '#1a2e1a', color2: '#1e3b2e', accent: '#4ADE80' },
  { color1: '#2d1b4e', color2: '#1e293b', accent: '#C084FC' },
  { color1: '#2d2416', color2: '#3b2e1a', accent: '#FCD34D' },
  { color1: '#2d1a1a', color2: '#3b2020', accent: '#F87171' },
  { color1: '#1e2926', color2: '#1a3530', accent: '#34D399' },
  { color1: '#1E293B', color2: '#2d3748', accent: '#818CF8' },
];

/** Стабільний вибір за слагом: та сама стаття завжди отримує ті самі кольори. */
export function paletteForSlug(slug: string): CoverPalette {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

const SIZE = { width: 1200, height: 630 };

function CoverArt({ title, category, p }: { title: string; category: string; p: CoverPalette }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', position: 'relative',
      background: `linear-gradient(135deg, ${p.color1} 0%, ${p.color2} 100%)`,
    }}>
      {/* Декоративні кола — ті самі, що в SVG-версії */}
      <div style={{
        position: 'absolute', left: 870, top: -60, width: 360, height: 360,
        borderRadius: 180, background: p.accent, opacity: 0.06, display: 'flex',
      }} />
      <div style={{
        position: 'absolute', left: 30, top: 400, width: 240, height: 240,
        borderRadius: 120, background: p.accent, opacity: 0.05, display: 'flex',
      }} />
      {/* Затемнення донизу */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 100%)',
      }} />
      {/* Акцентна смуга зліва */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: 630, background: p.accent, opacity: 0.8, display: 'flex' }} />

      {/* Бейдж категорії */}
      <div style={{
        position: 'absolute', left: 60, top: 60, height: 34, padding: '0 20px',
        borderRadius: 17, border: `1px solid ${p.accent}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, color: p.accent,
      }}>
        {category}
      </div>

      {/* Заголовок */}
      <div style={{
        position: 'absolute', left: 100, top: 150, width: 1000, height: 330,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 46, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.25,
      }}>
        {title}
      </div>

      {/* Роздільник */}
      <div style={{ position: 'absolute', left: 60, top: 510, width: 1080, height: 1, background: 'rgba(255,255,255,0.1)', display: 'flex' }} />

      {/* Логотип: три смужки + «fixline» */}
      <div style={{ position: 'absolute', left: 60, top: 528, height: 50, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ width: 30, height: 7, borderRadius: 4, background: '#4880B8', display: 'flex' }} />
          <div style={{ width: 22, height: 7, borderRadius: 4, background: '#fff', display: 'flex' }} />
          <div style={{ width: 14, height: 7, borderRadius: 4, background: '#fff', display: 'flex' }} />
        </div>
        <div style={{ width: 2, height: 30, background: '#4880B8', opacity: 0.5, display: 'flex' }} />
        {/* Одним текстовим вузлом: satori розсуває сусідні span-и, і «fixline»
            перетворювалося на «fix line» */}
        <div style={{ display: 'flex', fontSize: 38, fontWeight: 600, color: '#fff', letterSpacing: -1 }}>
          fixline
        </div>
      </div>

      <div style={{
        position: 'absolute', right: 60, top: 540, display: 'flex',
        fontSize: 15, color: 'rgba(255,255,255,0.3)',
      }}>
        fixline.com.ua
      </div>
    </div>
  );
}

/** PNG-байти обкладинки. */
export async function renderCover(opts: { title: string; category: string; palette: CoverPalette }): Promise<Buffer> {
  const res = new ImageResponse(
    <CoverArt title={opts.title} category={opts.category} p={opts.palette} />,
    SIZE,
  );
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Намалювати й покласти в R2. Повертає шлях виду /img/products/blog/covers/...
 * (той самий rewrite, що обслуговує фото товарів).
 */
export async function buildAndUploadCover(opts: {
  slug: string; title: string; category: string; lang: 'uk' | 'ru';
}): Promise<string> {
  const png = await renderCover({
    title: opts.title,
    category: opts.category,
    palette: paletteForSlug(opts.slug),
  });
  const key = `blog/covers/${opts.slug}${opts.lang === 'ru' ? '-ru' : ''}.png`;
  return uploadToR2(key, png, 'image/png');
}

/**
 * Обидві мови одразу. Помилка генерації не має валити створення статті —
 * обкладинку завжди можна перемалювати кнопкою, а текст цінніший.
 */
export async function buildCovers(post: {
  slug: string; title: string; title_ru?: string | null;
  category?: string | null; category_ru?: string | null;
}): Promise<{ image?: string; image_ru?: string }> {
  const out: { image?: string; image_ru?: string } = {};
  try {
    out.image = await buildAndUploadCover({
      slug: post.slug, title: post.title,
      category: post.category || 'Поради', lang: 'uk',
    });
  } catch (err) {
    console.error('[blog-cover] ua failed:', post.slug, err);
  }
  if (post.title_ru) {
    try {
      out.image_ru = await buildAndUploadCover({
        slug: post.slug, title: post.title_ru,
        category: post.category_ru || 'Советы', lang: 'ru',
      });
    } catch (err) {
      console.error('[blog-cover] ru failed:', post.slug, err);
    }
  }
  return out;
}
