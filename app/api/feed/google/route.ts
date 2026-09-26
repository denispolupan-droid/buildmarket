import { NextRequest, NextResponse } from 'next/server';

/**
 * Застарілий фід Merchant Center. Замінений на /api/google-merchant-feed
 * (той самий g:id = SKU, тож для Merchant Center це той самий товар), але:
 * посилання на слаг замість /product/{SKU} із редиректом, utm-мітки, sale_price,
 * item_group_id по лінійках, product_type і google_product_category.
 *
 * Не видаляємо, а перенаправляємо: якщо в Merchant Center досі стоїть ця
 * адреса, джерело не зламається. Ключ передається як є — перевіряє новий роут.
 */
export async function GET(request: NextRequest) {
  const url = new URL('/api/google-merchant-feed', request.nextUrl.origin);
  const key = request.nextUrl.searchParams.get('key');
  if (key) url.searchParams.set('key', key);
  return NextResponse.redirect(url, 308);
}
