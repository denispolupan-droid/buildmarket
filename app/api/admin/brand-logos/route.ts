import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { revalidateTag } from 'next/cache';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { normalizeBrandLogo } from '../../../../lib/brand-logo';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function requireAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user && user.user_metadata?.role === 'admin';
}

function brandSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, '-');
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await req.formData();
  const file  = formData.get('file') as File | null;
  const brand = (formData.get('brand') as string | null)?.trim();

  if (!file)  return NextResponse.json({ error: 'Файл не вказано' },  { status: 400 });
  if (!brand) return NextResponse.json({ error: 'Бренд не вказано' }, { status: 400 });

  const srcBuf = Buffer.from(await file.arrayBuffer());

  let webpBuf: Buffer;
  try {
    webpBuf = await normalizeBrandLogo(srcBuf);
  } catch {
    return NextResponse.json({ error: 'Не вдалося обробити зображення' }, { status: 422 });
  }

  // Version lives in the path (not a "?v=" query string) so the /img/:path* edge cache,
  // which is keyed on path alone, always sees a fresh URL after a re-upload.
  const version = createHash('sha256').update(webpBuf).digest('hex').slice(0, 10);
  const storagePath = `brand-logos/${brandSlug(brand)}-${version}.webp`;

  const { error: upErr } = await serviceClient.storage
    .from('products')
    .upload(storagePath, webpBuf, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const logoUrl = `/img/products/${storagePath}`;
  const { error: dbErr } = await serviceClient
    .from('brand_logos')
    .upsert({ brand_name: brand, logo_url: logoUrl, updated_at: new Date().toISOString() }, { onConflict: 'brand_name' });
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  revalidateTag('brand-logos', 'max');
  return NextResponse.json({ logoUrl });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { brand } = await req.json() as { brand?: string };
  if (!brand) return NextResponse.json({ error: 'Бренд не вказано' }, { status: 400 });

  const { error } = await serviceClient.from('brand_logos').delete().eq('brand_name', brand);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag('brand-logos', 'max');
  return NextResponse.json({ ok: true });
}
