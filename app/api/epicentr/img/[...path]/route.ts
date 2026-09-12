import { NextRequest, NextResponse } from 'next/server';
import { fetchSourceWebp, toEpicentrJpeg } from '../../../../../lib/epicentr-images';

/**
 * Запасний шлях для фото Епіцентру: конвертація WebP → JPEG на льоту.
 *
 * Основні фото у фіді — статичні JPEG у R2 (lib/epicentr-images). Сюди фід
 * посилається лише для фото, яких ще немає в маніфесті (новий товар), і в фоні
 * догенеровує статичний файл. Шлях: /api/epicentr/img/{шлях у /img/products без
 * розширення}.jpg, обмежений буквами/цифрами/дефісом — щоб роут не став проксі.
 * Відповідь з точним Content-Length і окремим HEAD: імпортер перевіряє фото HEAD-ом.
 */

const SEGMENT_RX = /^[\p{L}\p{N}_-]{1,120}$/u;
type Ctx = { params: Promise<{ path: string[] }> };

export async function HEAD(req: NextRequest, ctx: Ctx) {
  const res = await GET(req, ctx);
  return new NextResponse(null, { status: res.status, headers: res.headers });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  const segs = (path ?? []).map(s => decodeURIComponent(s));
  const last = segs.at(-1) ?? '';
  if (!last.endsWith('.jpg') || segs.length > 3) return notFound();
  segs[segs.length - 1] = last.slice(0, -4);
  if (!segs.every(s => SEGMENT_RX.test(s))) return notFound();

  const src = await fetchSourceWebp(segs.join('/'));
  if (!src) return notFound();
  const jpeg = await toEpicentrJpeg(src);

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(jpeg.length),
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
    },
  });
}

function notFound() {
  return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
