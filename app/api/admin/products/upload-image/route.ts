import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { normalizeProductImage } from '../../../../../lib/product-image';
import { uploadToR2, deleteFromR2 } from '../../../../../lib/r2';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const file  = formData.get('file') as File | null;
  const brand = (formData.get('brand') as string | null)?.trim().toLowerCase();
  const sku   = (formData.get('sku')   as string | null)?.trim();

  if (!file)  return NextResponse.json({ error: 'Файл не вказано' },  { status: 400 });
  if (!brand) return NextResponse.json({ error: 'Бренд не вказано' }, { status: 400 });
  if (!sku)   return NextResponse.json({ error: 'SKU не вказано' },   { status: 400 });

  // brand/sku go straight into the R2 object key — reject path separators and
  // traversal so an upload cannot escape its prefix or overwrite arbitrary keys.
  if (/[\/\\]|\.\./.test(brand) || /[\/\\]|\.\./.test(sku))
    return NextResponse.json({ error: 'Некоректний бренд або SKU' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'Файл завеликий (макс. 10 МБ)' }, { status: 413 });

  // Look up the product's current photo now, before it's overwritten below, so the old
  // R2 object can be cleaned up once the new one is safely uploaded — otherwise every
  // re-upload leaves an orphaned file behind, same as the old Supabase Storage did.
  const { data: existing } = await serviceClient
    .from('products')
    .select('image')
    .eq('sku', sku)
    .single();
  const oldImage = existing?.image ?? null;

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

  // Clean up the previous photo now that the new one is safely in place. Only ever
  // deletes our own /img/products/... keys — a stray external or malformed value in
  // the DB is left untouched rather than risking a delete on some unrelated URL.
  if (oldImage && oldImage.startsWith('/img/products/') && oldImage !== imageUrl) {
    try {
      await deleteFromR2([oldImage.replace(/^\/img\/products\//, '')]);
    } catch {
      // Non-fatal — the new photo already uploaded fine; an orphaned old file just
      // sits unused in R2 (well within the free tier) rather than breaking the upload.
    }
  }

  return NextResponse.json({ imageUrl });
}
