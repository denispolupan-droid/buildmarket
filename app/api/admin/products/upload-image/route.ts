import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { normalizeProductImage } from '../../../../../lib/product-image';
import { uploadToR2 } from '../../../../../lib/r2';
import { brandFolder } from '../../../../../lib/seo/slug';

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
  const storagePath = `${brandFolder(brand)}/${sku}-${version}.webp`;

  let imageUrl: string;
  try {
    imageUrl = await uploadToR2(storagePath, webpBuf, 'image/webp');
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: 500 });
  }

  // Старий файл тут НЕ видаляємо. Раніше видаляли одразу після заливки — і це
  // лишало биті фото: новий шлях потрапляє в БД лише по «Зберегти» (не зберіг —
  // старого файлу вже немає), а один файл може ділити кілька товарів (1603-011
  // посилався на фото 1603-010 і втратив його разом із ним). Прибирання старого
  // файлу — в PUT /api/admin/products, після запису нового шляху, і тільки якщо
  // на нього не посилається інший товар (lib/product-image-cleanup).
  return NextResponse.json({ imageUrl });
}
