import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');

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
    webpBuf = await sharp(srcBuf)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
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

  return NextResponse.json({ imageUrl: `/img/products/${storagePath}` });
}
