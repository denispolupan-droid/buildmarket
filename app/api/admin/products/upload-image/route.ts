import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { normalizeProductImage } from '../../../../../lib/product-image';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

  const storagePath = `${brand}/${sku}.webp`;
  const { error: upErr } = await serviceClient.storage
    .from('products')
    .upload(storagePath, webpBuf, { contentType: 'image/webp', upsert: true });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Cache-bust: the storage path is stable (upsert), so browsers/CDN will keep
  // serving old bytes under the same URL unless the URL itself changes.
  const version = createHash('sha256').update(webpBuf).digest('hex').slice(0, 10);

  return NextResponse.json({ imageUrl: `/img/products/${storagePath}?v=${version}` });
}
