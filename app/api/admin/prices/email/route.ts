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

// ── Social icon SVG paths (Simple Icons, 24×24 viewBox) ───────────────────────
async function fetchIconPath(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@14/icons/${name}.svg`);
    if (!res.ok) return null;
    const svg = await res.text();
    const m   = svg.match(/\sd="([^"]+)"/);
    return m ? m[1] : null;
  } catch { return null; }
}

// ── Image helpers ─────────────────────────────────────────────────────────────
async function fetchUrl(url: string, timeoutMs = 8000): Promise<Buffer | null> {
  try {
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), timeoutMs);
    const r  = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');

async function toJpeg(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .flatten({ background: '#ffffff' })  // fill PNG transparency with white before JPEG conversion
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function fetchImageBuffer(imagePath: string): Promise<Buffer | null> {

  // 1. Local public folder (JPEG / PNG / WebP — sharp handles all)
  try {
    const buf = readFileSync(join(process.cwd(), 'public', imagePath.replace(/^\//, '')));
    return await toJpeg(buf);
  } catch { /* not in public/ */ }

  // 2. Fetch raw bytes from Supabase storage, convert with sharp
  const supabaseSrc = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${imagePath.replace(/^\/img\//, '')}`;
  const raw = await fetchUrl(supabaseSrc);
  if (!raw) return null;
  try { return await toJpeg(raw); } catch { return null; }
}

async function fetchImages(skuImageMap: Map<string, string>): Promise<Map<string, Buffer>> {
  const entries = [...skuImageMap.entries()];
  const CONCURRENCY = 12;
  const result = new Map<string, Buffer>();
  let i = 0;

  async function worker() {
    while (i < entries.length) {
      const [sku, path] = entries[i++];
      const buf = await fetchImageBuffer(path);
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
  const [fontReg, fontBold, iconViber, iconTelegram, iconInstagram] = await Promise.all([
    fetchFont(false), fetchFont(true),
    fetchIconPath('viber'), fetchIconPath('telegram'), fetchIconPath('instagram'),
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
    const C_PRICE = 60;
    const C_VOL   = 64;
    const C_BRAND = showBrand ? 70 : 0;
    const C_NAME  = PW - C_IMG - C_PRICE - C_VOL - C_BRAND;

    const date = new Date().toLocaleDateString('uk-UA');

    // ── Page header — drawn ONLY on the first page ────────────────────────────
    let headerDrawn = false;
    function drawPageHeader() {
      if (headerDrawn) return;  // subsequent pages: no header
      headerDrawn = true;

      const y0 = M;
      const H  = 68;
      doc.rect(M, y0, PW, H).fill('#1E3A5F');

      // ── Logo (replicate fixline-logo-white.svg geometry) ──────────────────
      // SVG: three tapering rounded bars + thin vertical divider + "fixline" text
      const bx      = M + 12;
      const barTop  = y0 + (H - 28) / 2; // center 28px icon block in header

      doc.roundedRect(bx, barTop,      22, 6, 3).fill('#4880B8'); // longest, blue
      doc.roundedRect(bx, barTop + 10, 16, 6, 3).fill('#fff');    // medium
      doc.roundedRect(bx, barTop + 20, 10, 6, 3).fill('#fff');    // short

      // Thin vertical line between icon and wordmark
      const svgSepX = bx + 30;
      doc.moveTo(svgSepX, y0 + 14).lineTo(svgSepX, y0 + H - 14)
         .strokeColor('#4880B8').lineWidth(1.5).stroke();

      // "fix" (bold) + "line" (regular) wordmark
      const fSize = 22;
      const wordX = svgSepX + 10;
      const wordY = y0 + (H - fSize) / 2 - 1;
      doc.font('B').fontSize(fSize);
      const fixW = doc.widthOfString('fix');
      doc.font('R').fontSize(fSize);
      const lineW = doc.widthOfString('line');
      doc.font('B').fontSize(fSize).fillColor('#fff').text('fix',  wordX,        wordY, { lineBreak: false });
      doc.font('R').fontSize(fSize).fillColor('#fff').text('line', wordX + fixW, wordY, { lineBreak: false });

      // Divider between wordmark and info block
      const div2X = wordX + fixW + lineW + 14;
      doc.moveTo(div2X, y0 + 14).lineTo(div2X, y0 + H - 14)
         .strokeColor('rgba(255,255,255,0.2)').lineWidth(1).stroke();

      // ПРАЙС-ЛИСТ / fixline.com.ua / date
      const txtX = div2X + 10;
      doc.font('R').fontSize(7.5).fillColor('rgba(255,255,255,0.55)')
         .text('ПРАЙС-ЛИСТ', txtX, y0 + 14, { lineBreak: false });
      doc.font('R').fontSize(9).fillColor('rgba(255,255,255,0.85)')
         .text('fixline.com.ua', txtX, y0 + 27, { lineBreak: false });
      doc.font('R').fontSize(8.5).fillColor('rgba(255,255,255,0.55)')
         .text(date, txtX, y0 + 42, { lineBreak: false });

      // Right: phone (slightly smaller so email is more balanced)
      doc.font('B').fontSize(11).fillColor('#fff')
         .text('+380 99 199 77 88', M, y0 + 13, { width: PW - 4, align: 'right', lineBreak: false });
      // Right: email (larger for better hierarchy balance)
      doc.font('R').fontSize(10).fillColor('rgba(255,255,255,0.85)')
         .text('info@fixline.com.ua', M, y0 + 30, { width: PW - 4, align: 'right', lineBreak: false });
      // Social circles (Viber / Telegram / Instagram) with brand SVG icons
      const socY = y0 + H - 22;
      const socX = M + PW - 4;
      const socR = 9;
      const socDefs: [string, string | null][] = [
        ['#7360F2', iconViber],
        ['#2AABEE', iconTelegram],
        ['#C13584', iconInstagram],
      ];
      for (let s = 2; s >= 0; s--) {
        const cx = socX - s * (socR * 2 + 4) - socR;
        const cy = socY + socR;
        const [color, iconPath] = socDefs[2 - s];
        doc.circle(cx, cy, socR).fill(color);
        if (iconPath) {
          // Scale Simple Icons 24×24 path to fit inside circle
          const sc = (socR * 1.5) / 24;
          doc.save();
          doc.transform(sc, 0, 0, sc, cx - 12 * sc, cy - 12 * sc);
          doc.path(iconPath).fillColor('#fff').fill();
          doc.restore();
        }
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
      doc.text('ЦІНА (₴)', x, y + 4, { width: C_PRICE, align: 'right', lineBreak: false });
      doc.moveTo(M, y + COL_H).lineTo(M + PW, y + COL_H).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
    }

    // ── Data row ───────────────────────────────────────────────────────────────
    function calcRowH(name: string): number {
      doc.font('R').fontSize(8);
      const textH = Math.max(18, doc.heightOfString(name, { width: C_NAME - 8 }) + 7);
      return showImages ? Math.max(46, textH) : textH;
    }

    function drawRow(y: number, rh: number, row: PdfRow, shade: boolean) {
      if (shade) doc.rect(M, y, PW, rh).fill('#F9FAFB');

      let x = M;

      // Image cell
      if (showImages) {
        const buf = imageBuffers.get(row.sku);
        if (buf) {
          try {
            const imgSize = Math.min(rh - 6, C_IMG - 4);
            const ix = x + (C_IMG - imgSize) / 2;
            const iy = y + (rh - imgSize) / 2;
            doc.image(buf, ix, iy, { width: imgSize, height: imgSize, fit: [imgSize, imgSize], align: 'center', valign: 'center' });
          } catch { /* skip broken image */ }
        } else {
          // Subtle placeholder for products without an image
          doc.roundedRect(x + 6, y + (rh - 28) / 2, C_IMG - 12, 28, 3).fill('#F1F5F9');
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
        .order('brand').order('name')
        .limit(2000),
      db.from('product_stock')
        .select('sku, price_unit, price_retail, price_drop, stock_status')
        .limit(2000),
      db.from('categories')
        .select('slug, name, description, parent_slug, sort_order'),
    ]);

    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

    const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));
    const catMap   = new Map((categories ?? []).map(c => [c.slug, c]));

    // Sort categories to match website order: parent.sort_order first, then child.sort_order
    const catSortOrder = new Map((categories ?? []).map(c => [c.slug, c.sort_order ?? 999]));
    const sortedCats = [...(categories ?? [])].sort((a, b) => {
      const aTop = a.parent_slug ? (catSortOrder.get(a.parent_slug) ?? 999) : (a.sort_order ?? 999);
      const bTop = b.parent_slug ? (catSortOrder.get(b.parent_slug) ?? 999) : (b.sort_order ?? 999);
      if (aTop !== bTop) return aTop - bTop;
      return (a.sort_order ?? 999) - (b.sort_order ?? 999);
    });

    const grouped = new Map<string, PdfGroup>();
    for (const cat of sortedCats) {
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

    const imageBuffers = showImages ? await fetchImages(skuImageMap) : new Map<string, Buffer>();

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
