import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { Resend } from 'resend';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const resend = new Resend(process.env.RESEND_API_KEY);

async function buildPdf(
  grouped: Map<string, { catName: string; rows: { name: string; brand: string; volume: string | null; price: number | null }[] }>,
  showBrand: boolean,
  priceLabel: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const date = new Date().toLocaleDateString('uk-UA');

    // ── Header ──────────────────────────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').text('FIXLINE — Прайс-лист', { align: 'left' });
    doc.fontSize(10).font('Helvetica').fillColor('#555').text(`Дата: ${date}`, { align: 'left' });
    doc.moveDown(0.8);

    // ── Column layout ────────────────────────────────────────────────────────────
    const PAGE_W = 515; // usable width (595 - 2*40)
    const COL_PRICE = 80;
    const COL_VOL   = 80;
    const COL_BRAND = showBrand ? 90 : 0;
    const COL_NAME  = PAGE_W - COL_PRICE - COL_VOL - COL_BRAND;
    const ROW_H = 16;

    function drawRow(
      y: number,
      name: string,
      brand: string,
      volume: string,
      price: string,
      isHeader = false,
      shade = false,
    ) {
      if (shade) doc.rect(40, y, PAGE_W, ROW_H).fill('#F3F4F6');
      doc.fillColor('#000').font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);

      let x = 40;
      doc.text(name,   x, y + 3, { width: COL_NAME - 4,  lineBreak: false, ellipsis: true });
      x += COL_NAME;
      if (showBrand) {
        doc.text(brand,  x, y + 3, { width: COL_BRAND - 4, lineBreak: false, ellipsis: true });
        x += COL_BRAND;
      }
      doc.text(volume, x, y + 3, { width: COL_VOL - 4,   lineBreak: false, ellipsis: true });
      x += COL_VOL;
      doc.text(price,  x, y + 3, { width: COL_PRICE,     lineBreak: false, align: 'right' });

      doc.moveTo(40, y + ROW_H).lineTo(555, y + ROW_H).strokeColor('#E5E7EB').stroke();
    }

    for (const [, { catName, rows }] of grouped) {
      // ensure space for category header + at least one row
      if (doc.y + ROW_H * 3 > 780) doc.addPage();

      // category header
      const catY = doc.y;
      doc.rect(40, catY, PAGE_W, ROW_H).fill('#1E3A5F');
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
         .text(catName, 44, catY + 3, { width: PAGE_W - 8, lineBreak: false });
      doc.y = catY + ROW_H;
      doc.moveDown(0);

      // column headers
      const headY = doc.y;
      drawRow(
        headY,
        'Назва',
        'Бренд',
        "Об'єм / Вага",
        priceLabel,
        true,
        true,
      );
      doc.y = headY + ROW_H;

      // data rows
      rows.forEach((r, i) => {
        if (doc.y + ROW_H > 780) doc.addPage();
        const rowY = doc.y;
        drawRow(
          rowY,
          r.name,
          r.brand ?? '',
          r.volume ?? '',
          r.price != null ? r.price.toLocaleString('uk-UA') + ' ₴' : '—',
          false,
          i % 2 === 1,
        );
        doc.y = rowY + ROW_H;
      });

      doc.moveDown(0.8);
    }

    doc.end();
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.user_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const email: string = body.email ?? '';
  const xlsxParams: Record<string, string> = typeof body.xlsxParams === 'string'
    ? JSON.parse(body.xlsxParams)
    : (body.xlsxParams ?? {});

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Невірний email' }, { status: 400 });
  }

  const priceType         = (xlsxParams.priceType ?? 'price_retail') as 'price_retail' | 'price_unit' | 'price_drop';
  const categoriesParam   = xlsxParams.categories ?? 'all';
  const includeOutOfStock = xlsxParams.includeOutOfStock === 'true';
  const showBrand         = xlsxParams.showBrand !== 'false';
  const selectedCats      = categoriesParam === 'all' ? null : new Set(categoriesParam.split(',').filter(Boolean));
  const priceLabel        = { price_retail: 'Роздрібна ціна (₴)', price_unit: 'Оптова ціна (₴)', price_drop: 'Ціна дроп (₴)' }[priceType];

  const [{ data: products }, { data: stock }, { data: categories }] = await Promise.all([
    db.from('products')
      .select('sku, name, brand, volume, category_slug, is_active')
      .eq('is_active', true)
      .order('category_slug', { nullsFirst: false })
      .order('brand').order('name'),
    db.from('product_stock')
      .select('sku, price_unit, price_retail, price_drop, stock_status'),
    db.from('categories').select('slug, name').order('sort_order'),
  ]);

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));
  const catMap   = new Map((categories ?? []).map(c => [c.slug, c]));

  const grouped = new Map<string, { catName: string; rows: { name: string; brand: string; volume: string | null; price: number | null }[] }>();

  for (const p of (products ?? [])) {
    const s = stockMap.get(p.sku);
    if (!s) continue;
    if (!includeOutOfStock && s.stock_status !== 'in_stock') continue;
    if (selectedCats && p.category_slug && !selectedCats.has(p.category_slug)) continue;

    const price    = Number(s[priceType]) || null;
    const catSlug  = p.category_slug ?? '__other__';
    const catName  = catSlug !== '__other__' ? (catMap.get(catSlug)?.name ?? catSlug) : 'Інше';

    if (!grouped.has(catSlug)) grouped.set(catSlug, { catName, rows: [] });
    grouped.get(catSlug)!.rows.push({ name: p.name, brand: p.brand, volume: p.volume, price });
  }

  const pdfBuffer = await buildPdf(grouped, showBrand, priceLabel);
  const dateLabel = new Date().toLocaleDateString('uk-UA');
  const dateStr   = new Date().toISOString().slice(0, 10);

  const { error } = await resend.emails.send({
    from: 'FixLine <orders@fixline.com.ua>',
    to:   [email],
    subject: `Прайс-лист FixLine — ${dateLabel}`,
    html: `<div style="font-family:Arial,sans-serif;color:#0F172A">
      <div style="background:#1E3A5F;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:4px">FixLine — Прайс-лист</div>
        <div style="font-size:20px;font-weight:800">fixline.com.ua</div>
      </div>
      <div style="padding:16px 24px;border:1px solid #E2E8F0;border-top:none;background:#F8FAFC">
        <p style="color:#374151;font-size:14px;margin:0">Актуальний прайс-лист у вкладенні (PDF).</p>
        <p style="color:#6B7280;font-size:12px;margin:8px 0 0">Дата: ${dateLabel}</p>
      </div>
    </div>`,
    attachments: [{
      filename: `pricelist_${dateStr}.pdf`,
      content:  pdfBuffer.toString('base64'),
    }],
  });

  if (error) {
    console.error('[prices/email] resend error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
