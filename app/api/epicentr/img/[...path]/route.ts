import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

/**
 * Фото товару для Епіцентру у JPEG.
 *
 * Наші фото зберігаються у WebP (R2, /img/products/{brand}/{sku}-{hash}.webp), а
 * імпортер Епіцентру картинки у WebP не підхоплює: після імпорту 12.09.2026 усі
 * 738 карток лишились без фото, хоча посилання віддавали 200. У їхніх шаблонах —
 * тільки jpg/jpeg. Тут конвертуємо на льоту:
 *   /api/epicentr/img/{шлях у /img/products без розширення}.jpg
 *
 * Імена з хешем вмісту незмінні — CDN кешує рік, конвертація одна на фото. Шлях
 * обмежений буквами/цифрами/дефісом, щоб роут не став проксі на довільні адреси.
 */

const SEGMENT_RX = /^[\p{L}\p{N}_-]{1,120}$/u;
const MIN_SIDE = 800;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const segs = (path ?? []).map(s => decodeURIComponent(s));
  const last = segs.at(-1) ?? '';
  if (!last.endsWith('.jpg') || segs.length > 3) return new NextResponse('Not found', { status: 404 });
  segs[segs.length - 1] = last.slice(0, -4);
  if (!segs.every(s => SEGMENT_RX.test(s))) return new NextResponse('Not found', { status: 404 });

  const base = process.env.R2_PUBLIC_URL || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://fixline.com.ua'}/img/products`;
  const res = await fetch(`${base}/${segs.map(encodeURIComponent).join('/')}.webp`);
  if (!res.ok) return new NextResponse('Not found', { status: 404 });

  const img = sharp(Buffer.from(await res.arrayBuffer()));
  const { width = 0, height = 0 } = await img.metadata();
  // Мінімум Епіцентру — 600×500 (xmlfayl). Поодинокі старі фото менші (428×429) —
  // доводимо до 800×800 без обрізання, полями білого тла.
  const pipeline = width < MIN_SIDE || height < MIN_SIDE
    ? img.resize(MIN_SIDE, MIN_SIDE, { fit: 'contain', background: '#ffffff' })
    : img;
  const jpeg = await pipeline
    .flatten({ background: '#ffffff' })   // прозорість WebP → біле тло, як вимагає Епіцентр
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
    },
  });
}
