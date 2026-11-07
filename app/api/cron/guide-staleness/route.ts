import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { alertAdmin } from '../../../../lib/alert';
import { withApi } from '../../../../lib/api-handler';
import { log } from '../../../../lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Тижнева зведення «які гайди категорій застаріли» (lib/seo/guide-staleness) у
 * Telegram. Розклад — vercel.json (пн 05:40 UTC). Лише читання.
 * Вимкнути: app_settings.guide_staleness = 'off'. ?dry=1 — повернути текст, не надсилати.
 */
async function _GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { createServiceClient } = await import('../../../../lib/supabase');
    const db = createServiceClient();
    const { data: sw } = await db.from('app_settings').select('value').eq('key', 'guide_staleness').maybeSingle();
    if ((sw?.value ?? '').trim().toLowerCase() === 'off') return NextResponse.json({ ok: true, skipped: 'guide_staleness=off' });

    const { fetchAllRows } = await import('../../../../lib/db-paginate');
    const { getCategoryContentCached } = await import('../../../../lib/category-content');
    const { auditCategories } = await import('../../../../lib/seo/category-audit');
    const { buildGuideStalenessMessage, guideStalenessRows } = await import('../../../../lib/seo/guide-staleness');
    const { SITE_URL } = await import('../../../../lib/site');

    const [products, categories, everBrands, metaUa, metaRu] = await Promise.all([
      fetchAllRows<{ sku: string; category_slug: string | null; brand: string | null; name: string | null; created_at: string | null }>((f, t) =>
        db.from('products').select('sku, category_slug, brand, name, created_at').eq('is_active', true).order('id').range(f, t)),
      fetchAllRows<{ slug: string; name: string; parent_slug: string | null }>((f, t) =>
        db.from('categories').select('slug, name, parent_slug').order('id').range(f, t)),
      fetchAllRows<{ brand: string | null; name: string | null; is_active: boolean | null }>((f, t) =>
        db.from('products').select('brand, name, is_active').order('id').range(f, t)),
      getCategoryContentCached('uk'),
      getCategoryContentCached('ru'),
    ]);
    const rows = auditCategories({
      categories, products, metaUa, metaRu,
      brands: [...new Set(products.map(p => p.brand).filter(Boolean))] as string[],
      knownBrands: [...new Set(everBrands.map(p => p.brand?.trim()).filter(Boolean))] as string[],
      allProducts: everBrands.map(p => ({ name: p.name, brand: p.brand, active: !!p.is_active })),
    });
    const html = buildGuideStalenessMessage(rows, SITE_URL);
    const n = guideStalenessRows(rows).length;
    if (req.nextUrl.searchParams.get('dry') === '1') return NextResponse.json({ ok: true, categories: n, html });
    if (!html) return NextResponse.json({ ok: true, categories: 0, sent: false });

    const { sendTelegramResult } = await import('../../../../lib/telegram');
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const r = chatId ? await sendTelegramResult(chatId, html, { disablePreview: true }) : { messageId: null, error: 'TELEGRAM_ADMIN_CHAT_ID не заданий' };
    if (r.messageId == null) alertAdmin('Зведення застарілих гайдів не надіслано в Telegram', r.error ?? 'без причини');
    log.info('cron.guide_staleness', { categories: n, sent: r.messageId != null });
    return NextResponse.json({ ok: r.messageId != null, categories: n, sent: r.messageId != null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    alertAdmin('Зведення застарілих гайдів не зібралось', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = withApi('cron/guide-staleness', _GET);
