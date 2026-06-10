import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { Resend } from 'resend';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _pdf = require('pdfkit');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PDFDocument: any = _pdf.default ?? _pdf;

const db     = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY);

async function fetchFont(bold = false): Promise<Buffer> {
  const name = bold ? 'DejaVuSans-Bold.ttf' : 'DejaVuSans.ttf';
  const res  = await fetch(`https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/${name}`);
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

interface PdfRow { name: string; brand: string; volume: string | null; price: number | null }
interface PdfGroup { catName: string; description: string; rows: PdfRow[] }

async function buildPdf(
  grouped: Map<string, PdfGroup>,
  showBrand: boolean,
  showDescriptions: boolean,
  priceLabel: string,
): Promise<Buffer> {
  const [fontReg, fontBold] = await Promise.all([fetchFont(false), fetchFont(true)]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.registerFont('R', fontReg);
    doc.registerFont('B', fontBold);

    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M      = 40;           // margin
    const PW     = 515;          // page width (595 - 2*40)
    const BOTTOM = 841.89 - M;   // A4 height minus margin

    const C_PRICE = 75;
    const C_VOL   = 85;
    const C_BRAND = showBrand ? 90 : 0;
    const C_NAME  = PW - C_PRICE - C_VOL - C_BRAND;

    const date = new Date().toLocaleDateString('uk-UA');

    // ── Page header ──────────────────────────────────────────────────────────────
    function drawPageHeader() {
      const y0 = M;
      doc.rect(M, y0, PW, 44).fill('#1E3A5F');
      // Company name
      doc.font('B').fontSize(20).fillColor('#fff')
         .text('FIXLINE', M + 12, y0 + 7, { lineBreak: false });
      doc.font('R').fontSize(8).fillColor('rgba(255,255,255,0.65)')
         .text('Прайс-лист · fixline.com.ua', M + 12, y0 + 30, { lineBreak: false });
      // Right: contacts
      doc.font('B').fontSize(10).fillColor('#fff')
         .text('+380 99 199 77 88', M, y0 + 8, { width: PW - 12, align: 'right', lineBreak: false });
      doc.font('R').fontSize(8).fillColor('rgba(255,255,255,0.75)')
         .text(`info@fixline.com.ua  ·  Дата: ${date}`, M, y0 + 26, { width: PW - 12, align: 'right', lineBreak: false });
      doc.y = y0 + 44 + 10;
    }
    drawPageHeader();

    // ── Column header row ─────────────────────────────────────────────────────
    const COL_H = 15;
    function drawColHeaders(y: number) {
      doc.rect(M, y, PW, COL_H).fill('#EFF6FF');
      doc.font('B').fontSize(7).fillColor('#1E3A5F');
      let x = M;
      doc.text('НАЗВА', x + 4, y + 4, { width: C_NAME - 8, lineBreak: false });
      x += C_NAME;
      if (showBrand) {
        doc.text('БРЕНД', x + 2, y + 4, { width: C_BRAND - 4, lineBreak: false });
        x += C_BRAND;
      }
      doc.text("ОБ'ЄМ", x, y + 4, { width: C_VOL, align: 'center', lineBreak: false });
      x += C_VOL;
      doc.text(priceLabel.toUpperCase(), x, y + 4, { width: C_PRICE, align: 'right', lineBreak: false });
      doc.moveTo(M, y + COL_H).lineTo(M + PW, y + COL_H).strokeColor('#CBD5E1').lineWidth(0.6).stroke();
    }

    // ── Data row ──────────────────────────────────────────────────────────────
    function calcRowH(name: string): number {
      doc.font('R').fontSize(8);
      return Math.max(18, doc.heightOfString(name, { width: C_NAME - 8 }) + 7);
    }

    function drawRow(y: number, rh: number, row: PdfRow, shade: boolean) {
      if (shade) doc.rect(M, y, PW, rh).fill('#F9FAFB');

      // Name — allowed to wrap
      doc.font('R').fontSize(8).fillColor('#111')
         .text(row.name, M + 4, y + 4, { width: C_NAME - 8, lineBreak: true, height: rh - 4 });

      // Other cells: vertically centred, no wrap
      const cy = y + rh / 2 - 4;
      let x = M + C_NAME;

      if (showBrand) {
        doc.font('R').fontSize(7.5).fillColor('#374151')
           .text(row.brand ?? '', x + 2, cy, { width: C_BRAND - 4, lineBreak: false, ellipsis: true });
        x += C_BRAND;
      }
      doc.font('R').fontSize(8).fillColor('#374151')
         .text(row.volume ?? '', x, cy, { width: C_VOL, align: 'center', lineBreak: false });
      x += C_VOL;
      doc.font('B').fontSize(8).fillColor('#111')
         .text(row.price != null ? row.price.toLocaleString('uk-UA') + ' ₴' : '—',
               x, cy, { width: C_PRICE, align: 'right', lineBreak: false });

      doc.moveTo(M, y + rh).lineTo(M + PW, y + rh).strokeColor('#E5E7EB').lineWidth(0.4).stroke();
      doc.y = y + rh;
    }

    // ── Content ───────────────────────────────────────────────────────────────
    for (const [, { catName, description, rows }] of grouped) {
      if (doc.y + 60 > BOTTOM) {
        doc.addPage();
        drawPageHeader();
      }

      // Category header
      const catY = doc.y;
      const CAT_H = 20;
      doc.rect(M, catY, PW, CAT_H).fill('#1D4ED8');
      doc.font('B').fontSize(9).fillColor('#fff')
         .text(catName, M + 8, catY + 5, { width: PW - 16, lineBreak: false });
      doc.y = catY + CAT_H + 2;

      // Description
      if (showDescriptions && description.trim()) {
        doc.font('R').fontSize(8).fillColor('#6B7280')
           .text(description, M + 4, doc.y, { width: PW - 8, lineBreak: true });
        doc.moveDown(0.25);
      }

      // Column headers
      drawColHeaders(doc.y);
      doc.y += COL_H;

      // Rows
      rows.forEach((r, i) => {
        const rh = calcRowH(r.name);
        if (doc.y + rh > BOTTOM) {
          doc.addPage();
          drawPageHeader();
          drawColHeaders(doc.y);
          doc.y += COL_H;
        }
        drawRow(doc.y, rh, r, i % 2 === 1);
      });

      doc.moveDown(0.8);
    }

    doc.end();
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !['admin', 'manager'].includes(user.user_metadata?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const email: string = body.email ?? '';
    const p: Record<string, string> = typeof body.xlsxParams === 'string'
      ? JSON.parse(body.xlsxParams)
      : (body.xlsxParams ?? {});

    if (!email.includes('@')) return NextResponse.json({ error: 'Невірний email' }, { status: 400 });

    const priceType        = (p.priceType ?? 'price_retail') as 'price_retail' | 'price_unit' | 'price_drop';
    const categoriesParam  = p.categories ?? 'all';
    const includeOOS       = p.includeOutOfStock === 'true';
    const showBrand        = p.showBrand !== 'false';
    const showDescriptions = p.showDescriptions === 'true';
    const selectedCats     = categoriesParam === 'all' ? null : new Set(categoriesParam.split(',').filter(Boolean));
    const priceLabel       = { price_retail: 'Роздрібна ціна (₴)', price_unit: 'Оптова ціна (₴)', price_drop: 'Ціна дроп (₴)' }[priceType];

    const [{ data: products, error: prodErr }, { data: stock }, { data: categories }] = await Promise.all([
      db.from('products')
        .select('sku, name, brand, volume, category_slug')
        .eq('is_active', true)
        .order('category_slug', { nullsFirst: false })
        .order('brand').order('name')
        .limit(2000),
      db.from('product_stock')
        .select('sku, price_unit, price_retail, price_drop, stock_status')
        .limit(2000),
      db.from('categories')
        .select('slug, name, description')
        .order('sort_order'),
    ]);

    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

    const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));
    const catMap   = new Map((categories ?? []).map(c => [c.slug, c]));

    // Pre-populate in sort_order so PDF follows catalog hierarchy
    const grouped = new Map<string, PdfGroup>();
    for (const cat of (categories ?? [])) {
      if (selectedCats && !selectedCats.has(cat.slug)) continue;
      grouped.set(cat.slug, { catName: cat.name, description: cat.description ?? '', rows: [] });
    }

    for (const prod of (products ?? [])) {
      const s = stockMap.get(prod.sku);
      if (!s) continue;
      if (!includeOOS && s.stock_status !== 'in_stock') continue;
      if (selectedCats && prod.category_slug && !selectedCats.has(prod.category_slug)) continue;

      const price = Number(s[priceType]) || null;
      const slug  = prod.category_slug ?? '__other__';

      if (!grouped.has(slug)) {
        const cat = catMap.get(slug);
        grouped.set(slug, { catName: cat?.name ?? slug, description: cat?.description ?? '', rows: [] });
      }
      grouped.get(slug)!.rows.push({ name: prod.name, brand: prod.brand, volume: prod.volume, price });
    }

    // Drop empty groups (categories that have no matching products)
    for (const [key, val] of grouped) {
      if (val.rows.length === 0) grouped.delete(key);
    }

    const pdfBuffer = await buildPdf(grouped, showBrand, showDescriptions, priceLabel);
    const dateLabel = new Date().toLocaleDateString('uk-UA');
    const dateStr   = new Date().toISOString().slice(0, 10);

    const { error: sendErr } = await resend.emails.send({
      from: 'FixLine <orders@fixline.com.ua>',
      to:   [email],
      subject: `Прайс-лист FixLine — ${dateLabel}`,
      html: `<div style="font-family:Arial,sans-serif;color:#0F172A">
        <div style="background:#1E3A5F;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:4px">FixLine</div>
          <div style="font-size:20px;font-weight:800">Прайс-лист</div>
        </div>
        <div style="padding:16px 24px;border:1px solid #E2E8F0;border-top:none;background:#F8FAFC">
          <p style="color:#374151;font-size:14px;margin:0">Актуальний прайс-лист у вкладенні (PDF).</p>
          <p style="color:#6B7280;font-size:12px;margin:8px 0 0">Дата: ${dateLabel}</p>
        </div>
      </div>`,
      attachments: [{ filename: `pricelist_${dateStr}.pdf`, content: pdfBuffer.toString('base64') }],
    });

    if (sendErr) return NextResponse.json({ error: sendErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[prices/email]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
