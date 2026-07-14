import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { revalidateTag } from 'next/cache';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { normalizeBrandLogo } from '../../../../lib/brand-logo';
import { uploadToR2 } from '../../../../lib/r2';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function requireAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user && user.user_metadata?.role === 'admin';
}

// Supabase Storage object keys reject non-ASCII characters, but brand names are often
// Cyrillic (e.g. "Байрис") — transliterate before slugifying so the upload doesn't 400.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ь: '', ю: 'iu', я: 'ia', ё: 'e', ъ: '', ы: 'y', э: 'e',
};

function transliterate(text: string): string {
  return text.toLowerCase().replace(/[а-яіїєґё]/g, ch => CYRILLIC_TO_LATIN[ch] ?? ch);
}

function brandSlug(brand: string): string {
  const slug = transliterate(brand.trim())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'brand';
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

  let logoUrl: string;
  try {
    logoUrl = await uploadToR2(storagePath, webpBuf, 'image/webp');
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: 500 });
  }

  const { error: dbErr } = await serviceClient
    .from('brand_logos')
    .upsert({ brand_name: brand, logo_url: logoUrl, updated_at: new Date().toISOString() }, { onConflict: 'brand_name' });
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  revalidateTag('brand-logos', 'max');
  return NextResponse.json({ logoUrl });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { brand, showOnHome } = await req.json() as { brand?: string; showOnHome?: boolean };
  if (!brand) return NextResponse.json({ error: 'Бренд не вказано' }, { status: 400 });
  if (typeof showOnHome !== 'boolean') return NextResponse.json({ error: 'showOnHome не вказано' }, { status: 400 });

  const { error } = await serviceClient
    .from('brand_logos')
    .update({ show_on_home: showOnHome, updated_at: new Date().toISOString() })
    .eq('brand_name', brand);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag('brand-logos', 'max');
  return NextResponse.json({ ok: true });
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
