import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { normalizeProductImage } from '../../../../../lib/product-image';
import { uploadToR2 } from '../../../../../lib/r2';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const file  = formData.get('file') as File | null;
  const brand = (formData.get('brand') as string | null)?.trim().toLowerCase();
  const sku   = (formData.get('sku')   as string | null)?.trim();

  if (!file)  return NextResponse.json({ error: 'Файл не вказано' },  { status: 400 });
  if (!brand) return NextResponse.json({ error: 'Бренд не вказано' }, { status: 400 });
  if (!sku)   return NextResponse.json({ error: 'SKU не вказано' },   { status: 400 });

  const srcBuf = Buffer.from(await file.arrayBuffer());

  let webpBuf: Buffer;
  try {
    webpBuf = await normalizeProductImage(srcBuf);
  } catch {
    return NextResponse.json({ error: 'Не вдалося обробити зображення' }, { status: 422 });
  }

  // The version must live in the path, not a "?v=" query string: Vercel's edge cache for
  // the /img/:path* rewrite is keyed on the path alone and ignores the query string, so a
  // re-upload under the same path+"?v=" can keep serving stale bytes to every visitor
  // indefinitely. A distinct path guarantees a genuinely new URL the cache has never seen.
  const version = createHash('sha256').update(webpBuf).digest('hex').slice(0, 10);
  const storagePath = `${brand}/${sku}-${version}.webp`;

  let imageUrl: string;
  try {
    imageUrl = await uploadToR2(storagePath, webpBuf, 'image/webp');
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: 500 });
  }

  return NextResponse.json({ imageUrl });
}
