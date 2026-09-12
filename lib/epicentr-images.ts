/**
 * Фото для Епіцентру — статичні JPEG у R2.
 *
 * Наші фото — WebP, а імпортер Епіцентру WebP не бере. Спершу віддавали JPEG
 * конвертацією на льоту (/api/epicentr/img), але кабінет підтягував фото вибірково:
 * відповідь 200 з коректним JPEG приходила, а картка лишалась без фото. Динамічна
 * відповідь не має ETag/Last-Modified і генерується щоразу — на відміну від фото
 * сайту, які Prom і Rozetka беруть без проблем. Тому JPEG генеруємо один раз і
 * кладемо в R2 поруч: /img/products/epicentr/{шлях без .webp}.jpg — звичайний
 * статичний файл через той самий rewrite, що й фото сайту.
 *
 * Які JPEG уже є — у маніфесті epicentr/manifest.json (щоб фід не робив сотні HEAD).
 */
import sharp from 'sharp';
import { uploadToR2 } from './r2';

export const EPICENTR_IMG_PREFIX = 'epicentr';
const MANIFEST_KEY = `${EPICENTR_IMG_PREFIX}/manifest.json`;
const MIN_SIDE = 800;
const SITE_URL = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://fixline.com.ua';

/** '/img/products/aura/x-1a2b.webp' → 'aura/x-1a2b'; не WebP з /img/products — null. */
export function webpRelFromImage(image: string | null | undefined): string | null {
  const m = /^(?:https?:\/\/[^/]+)?\/img\/products\/(.+)\.webp$/.exec(image ?? '');
  return m ? m[1] : null;
}

export const jpegKeyFor = (rel: string) => `${EPICENTR_IMG_PREFIX}/${rel}.jpg`;

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** Публічна статична адреса JPEG (через rewrite /img/products → R2). */
export const staticJpegUrl = (rel: string) => `${SITE_URL()}/img/products/${encodePath(jpegKeyFor(rel))}`;

/** Запасна адреса — конвертація на льоту, поки статичного файлу ще немає. */
export const dynamicJpegUrl = (rel: string) => `${SITE_URL()}/api/epicentr/img/${encodePath(rel)}.jpg`;

/** WebP-джерело: спершу R2, інакше сайт (частина старих фото лежить у public/). */
export async function fetchSourceWebp(rel: string): Promise<Buffer | null> {
  const encoded = `${encodePath(rel)}.webp`;
  let res = process.env.R2_PUBLIC_URL ? await fetch(`${process.env.R2_PUBLIC_URL}/${encoded}`) : null;
  if (!res?.ok) res = await fetch(`${SITE_URL()}/img/products/${encoded}`);
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** WebP → JPEG на білому тлі; фото менші за мінімум Епіцентру доводяться до 800×800 полями. */
export async function toEpicentrJpeg(webp: Buffer): Promise<Buffer> {
  const img = sharp(webp);
  const { width = 0, height = 0 } = await img.metadata();
  const pipeline = width < MIN_SIDE || height < MIN_SIDE
    ? img.resize(MIN_SIDE, MIN_SIDE, { fit: 'contain', background: '#ffffff' })
    : img;
  return pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/** Набір rel, для яких JPEG уже в R2. Порожній набір — якщо маніфесту ще немає. */
export async function readEpicentrManifest(): Promise<Set<string>> {
  if (!process.env.R2_PUBLIC_URL) return new Set();
  try {
    const res = await fetch(`${process.env.R2_PUBLIC_URL}/${MANIFEST_KEY}`, { cache: 'no-store' });
    if (!res.ok) return new Set();
    const list = await res.json() as unknown;
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Генерує відсутні JPEG і дописує їх у маніфест. Повертає, скільки створено і
 * скільки джерел не знайдено (битi посилання на фото в картці).
 */
export async function ensureEpicentrJpegs(rels: string[], opts: { concurrency?: number; force?: boolean } = {}):
  Promise<{ created: number; missingSource: string[]; total: number }> {
  const manifest = await readEpicentrManifest();
  const todo = [...new Set(rels)].filter(r => opts.force || !manifest.has(r));
  const missingSource: string[] = [];
  let created = 0;
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const rel = todo[i++];
      try {
        const src = await fetchSourceWebp(rel);
        if (!src) { missingSource.push(rel); continue; }
        await uploadToR2(jpegKeyFor(rel), await toEpicentrJpeg(src), 'image/jpeg');
        manifest.add(rel);
        created++;
      } catch (err) {
        console.error('[epicentr-images]', rel, err instanceof Error ? err.message : err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 6, todo.length) }, worker));
  if (created) {
    await uploadToR2(MANIFEST_KEY, Buffer.from(JSON.stringify([...manifest].sort())), 'application/json', 'no-store');
  }
  return { created, missingSource, total: todo.length };
}
