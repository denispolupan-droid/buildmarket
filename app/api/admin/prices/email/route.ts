import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _pdf = require('pdfkit');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PDFDocument: any = _pdf.default ?? _pdf;

const db     = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Fonts ──────────────────────────────────────────────────────────────────────
async function fetchFont(bold = false): Promise<Buffer> {
  const name = bold ? 'DejaVuSans-Bold.ttf' : 'DejaVuSans.ttf';
  const res  = await fetch(`https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/${name}`);
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Image helpers ─────────────────────────────────────────────────────────────
function isEmbeddable(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true; // PNG
  return false;
}

async function fetchUrl(url: string, timeoutMs = 6000): Promise<Buffer | null> {
  try {
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), timeoutMs);
    // Accept header prevents Next.js image optimizer from returning WebP (PDFKit can't embed it)
    const r  = await fetch(url, { signal: ac.signal, headers: { Accept: 'image/jpeg,image/png,image/*;q=0.5' } });
    clearTimeout(t);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

async function fetchImageBuffer(imagePath: string, origin: string): Promise<Buffer | null> {
  // 1. Local public folder
  try {
    const buf = readFileSync(join(process.cwd(), 'public', imagePath.replace(/^\//, '')));
    if (isEmbeddable(buf)) return buf;
  } catch { /* not local */ }

  // 2. Via /_next/image — resizes to 64px so large originals don't bloat the PDF.
  //    Raw Supabase JPEGs can be 200-500KB each; at 200 products that's 40-100MB.
  //    The image optimizer returns ~3-8KB thumbnails regardless of source format.
  const supabaseSrc = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${imagePath.replace(/^\/img\//, '')}`;
  const thumb = await fetchUrl(`${origin}/_next/image?url=${encodeURIComponent(supabaseSrc)}&w=64&q=70`);
  if (thumb && isEmbeddable(thumb)) return thumb;

  return null;
}

async function fetchImages(skuImageMap: Map<string, string>, origin: string): Promise<Map<string, Buffer>> {
  const entries = [...skuImageMap.entries()];
  const CONCURRENCY = 12;
  const result = new Map<string, Buffer>();
  let i = 0;

  async function worker() {
    while (i < entries.length) {
      const [sku, path] = entries[i++];
      const buf = await fetchImageBuffer(path, origin);
      if (buf) result.set(sku, buf);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  return result;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PdfRow    { sku: string; name: string; brand: string; volume: string | null; price: number | null }
interface PdfGroup  { catName: string; description: string; rows: PdfRow[] }

// ── PDF builder ───────────────────────────────────────────────────────────────
async function buildPdf(
  grouped: Map<string, PdfGroup>,
  opts: { showBrand: boolean; showDescriptions: boolean; showImages: boolean; priceLabel: string },
  imageBuffers: Map<string, Buffer>,
): Promise<Buffer> {
  const [fontReg, fontBold, logoBuffer] = await Promise.all([
    fetchFont(false),
    fetchFont(true),
    (async () => {
      try { return readFileSync(join(process.cwd(), 'public', 'fixline-logo.png')); }
      catch { return null; }
    })(),
  ]);

  const { showBrand, showDescriptions, showImages, priceLabel } = opts;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.registerFont('R', fontReg);
    doc.registerFont('B', fontBold);

    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M      = 36;
    const PW     = 595 - M * 2;   // 523
    const BOTTOM = 841.89 - M;

    const C_IMG   = showImages ? 46 : 0;
    const C_PRICE = 76;
    const C_VOL   = 82;
    const C_BRAND = showBrand ? 88 : 0;
    const C_NAME  = PW - C_IMG - C_PRICE - C_VOL - C_BRAND;

    const date = new Date().toLocaleDateString('uk-UA');

    // ── Page header ────────────────────────────────────────────────────────────
    function drawPageHeader() {
      const y0 = M;
      const H  = 66;
      doc.rect(M, y0, PW, H).fill('#1E3A5F');

      // Logo: actual PNG is 1421×246 → at height 30 the width = round(30 * 1421/246) = 173px
      const LOGO_H = 30;
      const LOGO_W = Math.round(LOGO_H * 1421 / 246); // 173
      let logoRightEdge = M + 12;
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, M + 10, y0 + (H - LOGO_H) / 2, { width: LOGO_W, height: LOGO_H });
          logoRightEdge = M + 10 + LOGO_W + 10;
        } catch { /* skip if image fails */ }
      }

      // Vertical divider
      const divX = logoRightEdge + 10;
      doc.moveTo(divX, y0 + 14).lineTo(divX, y0 + H - 14)
         .strokeColor('rgba(255,255,255,0.25)').lineWidth(1).stroke();

      // Label + url + date
      const txtX = divX + 12;
      doc.font('R').fontSize(7.5).fillColor('rgba(255,255,255,0.55)')
         .text('ПРАЙС-ЛИСТ', txtX, y0 + 14, { lineBreak: false });
      doc.font('R').fontSize(9).fillColor('rgba(255,255,255,0.85)')
         .text('fixline.com.ua', txtX, y0 + 27, { lineBreak: false });
      doc.font('R').fontSize(8.5).fillColor('rgba(255,255,255,0.55)')
         .text(date, txtX, y0 + 41, { lineBreak: false });

      // Phone
      doc.font('B').fontSize(14).fillColor('#fff')
         .text('+380 99 199 77 88', M, y0 + 11, { width: PW - 4, align: 'right', lineBreak: false });
      // Email
      doc.font('R').fontSize(8.5).fillColor('rgba(255,255,255,0.75)')
         .text('info@fixline.com.ua', M, y0 + 31, { width: PW - 4, align: 'right', lineBreak: false });
      // Social dots
      const socY  = y0 + 47;
      const socX  = M + PW - 4;
      const socR  = 9;
      const socColors = ['#7360F2', '#2AABEE', '#C13584'];
      const socLabels = ['V', 'T', 'I'];
      for (let s = 2; s >= 0; s--) {
        const cx = socX - s * (socR * 2 + 4);
        doc.circle(cx - socR, socY + socR, socR).fill(socColors[2 - s]);
        doc.font('B').fontSize(7).fillColor('#fff')
           .text(socLabels[2 - s], cx - socR * 2 + 2, socY + socR - 4, { width: socR * 2 - 2, align: 'center', lineBreak: false });
      }

      doc.y = y0 + H + 8;
    }
    drawPageHeader();

    // ── Column headers ──────────────────────────────────────────────────────────
    const COL_H = 15;
    function drawColHeaders(y: number) {
      doc.rect(M, y, PW, COL_H).fill('#EFF6FF');
      doc.font('B').fontSize(7).fillColor('#1E3A5F');
      let x = M;
      if (showImages) {
        doc.text('', x, y + 4, { width: C_IMG, lineBreak: false });
        x += C_IMG;
      }
      doc.text('НАЗВА', x + 3, y + 4, { width: C_NAME - 6, lineBreak: false });
      x += C_NAME;
      if (showBrand) {
        doc.text('БРЕНД', x + 2, y + 4, { width: C_BRAND - 4, lineBreak: false });
        x += C_BRAND;
      }
      doc.text("ОБ'ЄМ", x, y + 4, { width: C_VOL, align: 'center', lineBreak: false });
      x += C_VOL;
      doc.text(priceLabel.toUpperCase(), x, y + 4, { width: C_PRICE, align: 'right', lineBreak: false });
      doc.moveTo(M, y + COL_H).lineTo(M + PW, y + COL_H).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
    }

    // ── Data row ───────────────────────────────────────────────────────────────
    function calcRowH(name: string, sku: string): number {
      doc.font('R').fontSize(8);
      const textH = Math.max(18, doc.heightOfString(name, { width: C_NAME - 8 }) + 7);
      // Enforce 46px min only when this row actually has an image to show
      return (showImages && imageBuffers.has(sku)) ? Math.max(46, textH) : textH;
    }

    function drawRow(y: number, rh: number, row: PdfRow, shade: boolean) {
      if (shade) doc.rect(M, y, PW, rh).fill('#F9FAFB');

      let x = M;

      // Image
      if (showImages) {
        const buf = imageBuffers.get(row.sku);
        if (buf) {
          try {
            doc.image(buf, x + 2, y + 2, { width: C_IMG - 4, height: rh - 4, fit: [C_IMG - 4, rh - 4], align: 'center', valign: 'center' });
          } catch { /* skip broken image */ }
        }
        x += C_IMG;
      }

      // Vertical centre for single-line cells
      const lineH = 8; // font size
      const cy    = y + (rh - lineH) / 2;

      // Name (wrapping, top-aligned)
      const nameTop = rh > 24 ? y + (rh - doc.heightOfString(row.name, { width: C_NAME - 6 })) / 2 : y + 4;
      doc.font('R').fontSize(8).fillColor('#111')
         .text(row.name, x + 3, Math.max(y + 3, nameTop), { width: C_NAME - 6, lineBreak: true, height: rh - 4 });
      x += C_NAME;

      // Other cells: vertically centred
      if (showBrand) {
        doc.font('R').fontSize(7.5).fillColor('#374151')
           .text(row.brand ?? '', x + 2, cy, { width: C_BRAND - 4, lineBreak: false, ellipsis: true });
        x += C_BRAND;
      }
      doc.font('R').fontSize(8).fillColor('#374151')
         .text(row.volume ?? '', x, cy, { width: C_VOL, align: 'center', lineBreak: false });
      x += C_VOL;
      doc.font('B').fontSize(8).fillColor('#111')
         .text(row.price != null ? row.price.toLocaleString('uk-UA') + ' ₴' : '—',
               x, cy, { width: C_PRICE, align: 'right', lineBreak: false });

      doc.moveTo(M, y + rh).lineTo(M + PW, y + rh).strokeColor('#E5E7EB').lineWidth(0.4).stroke();
      doc.y = y + rh;
    }

    // ── Categories ─────────────────────────────────────────────────────────────
    for (const [, { catName, description, rows }] of grouped) {
      if (doc.y + 60 > BOTTOM) {
        doc.addPage();
        drawPageHeader();
      }

      const catY  = doc.y;
      const CAT_H = 20;
      doc.rect(M, catY, PW, CAT_H).fill('#1D4ED8');
      doc.font('B').fontSize(9).fillColor('#fff')
         .text(catName, M + 8, catY + 5, { width: PW - 16, lineBreak: false });
      doc.y = catY + CAT_H + 2;

      if (showDescriptions && description.trim()) {
        doc.font('R').fontSize(8).fillColor('#6B7280')
           .text(description, M + 4, doc.y, { width: PW - 8, lineBreak: true });
        doc.moveDown(0.2);
      }

      drawColHeaders(doc.y);
      doc.y += COL_H;

      rows.forEach((r, i) => {
        const rh = calcRowH(r.name, r.sku);
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

// ── Route ──────────────────────────────────────────────────────────────────────
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
      ? JSON.parse(body.xlsxParams) : (body.xlsxParams ?? {});

    if (!email.includes('@')) return NextResponse.json({ error: 'Невірний email' }, { status: 400 });

    const priceType        = (p.priceType ?? 'price_retail') as 'price_retail' | 'price_unit' | 'price_drop';
    const categoriesParam  = p.categories ?? 'all';
    const includeOOS       = p.includeOutOfStock === 'true';
    const showBrand        = p.showBrand !== 'false';
    const showDescriptions = p.showDescriptions === 'true';
    const showImages       = p.showImages === 'true';
    const selectedCats     = categoriesParam === 'all' ? null : new Set(categoriesParam.split(',').filter(Boolean));
    const priceLabel       = { price_retail: 'Роздрібна ціна (₴)', price_unit: 'Оптова ціна (₴)', price_drop: 'Ціна дроп (₴)' }[priceType];

    const [{ data: products, error: prodErr }, { data: stock }, { data: categories }] = await Promise.all([
      db.from('products')
        .select('sku, name, brand, volume, category_slug, image')
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

    const grouped = new Map<string, PdfGroup>();
    for (const cat of (categories ?? [])) {
      if (selectedCats && !selectedCats.has(cat.slug)) continue;
      grouped.set(cat.slug, { catName: cat.name, description: cat.description ?? '', rows: [] });
    }

    const skuImageMap = new Map<string, string>();

    for (const prod of (products ?? [])) {
      const s = stockMap.get(prod.sku);
      if (!s) continue;
      if (!includeOOS && s.stock_status !== 'in_stock') continue;
      if (selectedCats && prod.category_slug && !selectedCats.has(prod.category_slug)) continue;

      const price = Number(s[priceType]) || null;
      const slug  = prod.category_slug ?? '__other__';
      const cat   = catMap.get(slug);

      if (!grouped.has(slug)) {
        grouped.set(slug, { catName: cat?.name ?? slug, description: cat?.description ?? '', rows: [] });
      }
      grouped.get(slug)!.rows.push({ sku: prod.sku, name: prod.name, brand: prod.brand, volume: prod.volume, price });

      if (showImages && prod.image) skuImageMap.set(prod.sku, prod.image);
    }

    for (const [key, val] of grouped) {
      if (val.rows.length === 0) grouped.delete(key);
    }

    const origin = req.nextUrl.origin;
    const imageBuffers = showImages ? await fetchImages(skuImageMap, origin) : new Map<string, Buffer>();

    const pdfBuffer = await buildPdf(
      grouped,
      { showBrand, showDescriptions, showImages, priceLabel },
      imageBuffers,
    );

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
