import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { uploadToR2, deleteFromR2 } from '../../../../lib/r2';
import { withApi } from '../../../../lib/api-handler';

const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif',
};
const MAX_BYTES = 5 * 1024 * 1024;

async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  // Тип — за MIME, не за розширенням у назві (аудит 31.10, §5 Low): банер
  // віддається публічно з R2, тож сюди не має потрапити ні html, ні svg зі скриптом.
  const ext = IMAGE_EXT[file.type];
  if (!ext) return NextResponse.json({ error: 'Лише зображення: JPEG, PNG, WebP, AVIF, GIF' }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `Файл більший за ${MAX_BYTES / 1024 / 1024} МБ` }, { status: 413 });

  const path = `promo/banner.${ext}`;
  const bytes = await file.arrayBuffer();

  let url: string;
  try {
    // Fixed filename (no content hash) — short cache so a re-upload shows up promptly;
    // the "?t=" query string still isn't honored by the edge cache, but a 5-minute
    // max-age bounds staleness on its own.
    url = await uploadToR2(path, Buffer.from(bytes), file.type, 'public, max-age=300');
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: 500 });
  }

  return NextResponse.json({ url: `${url}?t=${Date.now()}` });
}

export const POST = withApi('admin/promo-image', _POST);

async function _DELETE() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  await deleteFromR2(Object.values(IMAGE_EXT).map(ext => `promo/banner.${ext}`));
  return NextResponse.json({ ok: true });
}

export const DELETE = withApi('admin/promo-image', _DELETE);
