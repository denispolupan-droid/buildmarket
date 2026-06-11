import { readFileSync } from 'fs';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _pdf = require('pdfkit');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PDFDocument: any = _pdf.default ?? _pdf;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');

// ── Fonts ──────────────────────────────────────────────────────────────────────
async function fetchFont(bold = false): Promise<Buffer> {
  const name = bold ? 'DejaVuSans-Bold.ttf' : 'DejaVuSans.ttf';
  const res  = await fetch(`https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/${name}`);
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Bootstrap icon SVG paths ──────────────────────────────────────────────────
async function fetchIconPaths(url: string): Promise<string[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const svg = await res.text();
    const paths: string[] = [];
    const re = /\sd="([^"]+)"/g;
    let m;
    while ((m = re.exec(svg)) !== null) paths.push(m[1]);
    return paths;
  } catch { return []; }
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

async function toJpeg(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .flatten({ background: '#ffffff' })
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function fetchImageBuffer(imagePath: string): Promise<Buffer | null> {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', imagePath.replace(/^\//, '')));
    return await toJpeg(buf);
  } catch { /* not in public/ */ }

  const supabaseSrc = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${imagePath.replace(/^\/img\//, '')}`;
  const raw = await fetchUrl(supabaseSrc);
  if (!raw) return null;
  try { return await toJpeg(raw); } catch { return null; }
}

export async function fetchImages(skuImageMap: Map<string, string>): Promise<Map<string, Buffer>> {
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
export interface PdfRow   { sku: string; name: string; brand: string; volume: string | null; price: number | null; price_promo?: number | null }
export interface PdfGroup { catName: string; description: string; rows: PdfRow[] }

// ── PDF builder ───────────────────────────────────────────────────────────────
export async function buildPdf(
  grouped: Map<string, PdfGroup>,
  opts: { showBrand: boolean; showDescriptions: boolean; showImages: boolean; priceLabel: string },
  imageBuffers: Map<string, Buffer>,
): Promise<Buffer> {
  const CDN = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons';
  const [fontReg, fontBold, icPhone, icMail, icGlobe] = await Promise.all([
    fetchFont(false), fetchFont(true),
    fetchIconPaths(`${CDN}/telephone-fill.svg`),
    fetchIconPaths(`${CDN}/envelope-fill.svg`),
    fetchIconPaths(`${CDN}/globe2.svg`),
  ]);

  const { showBrand, showDescriptions, showImages } = opts;

  const logoBuf = Buffer.from('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', 'base64');

  return new Promise((resolve, reject) => {
    const M      = 26;
    const PW     = 595 - M * 2;   // 543
    const BOTTOM = 841.89 - M;

    const doc = new PDFDocument({ margin: M, size: 'A4', bufferPages: true });
    doc.registerFont('R', fontReg);
    doc.registerFont('B', fontBold);

    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const C_IMG   = showImages ? 46 : 0;
    const C_PRICE = 60;
    const C_VOL   = 64;
    const C_BRAND = showBrand ? 70 : 0;
    const C_NAME  = PW - C_IMG - C_PRICE - C_VOL - C_BRAND;

    const date = new Date().toLocaleDateString('uk-UA');

    // ── Page header — first page only ─────────────────────────────────────────
    let headerDrawn = false;
    function drawPageHeader() {
      if (headerDrawn) return;
      headerDrawn = true;

      const y0 = M;
      const H  = 74;
      doc.rect(M, y0, PW, H).fill('#1E3A5F');

      const LOGO_H = 38;
      const LOGO_W = Math.round(LOGO_H * 178 / 42); // ≈161
      const logoX  = M + 8;
      const logoY  = y0 + (H - LOGO_H) / 2;

      // Dividers
      const barH   = Math.round((28 / 42) * LOGO_H);
      const barTop = y0 + Math.round((H - barH) / 2);
      const barBot = barTop + barH;
      const div1X  = logoX + LOGO_W + 12;
      const div2X  = M + PW - 178;
      for (const dx of [div1X, div2X]) {
        doc.moveTo(dx, barTop).lineTo(dx, barBot)
           .strokeColor('#4880B8').strokeOpacity(0.5).lineWidth(1.5).stroke();
      }
      doc.strokeOpacity(1);

      // Centre: ПРАЙС-ЛИСТ + date
      const midX = div1X + 10;
      const midW = div2X - div1X - 20;
      doc.font('B').fontSize(13).fillColor('#fff').fillOpacity(0.95)
         .text('ПРАЙС-ЛИСТ', midX, y0 + 22, { width: midW, align: 'center', lineBreak: false });
      doc.font('R').fontSize(9).fillColor('#fff').fillOpacity(0.55)
         .text(date, midX, y0 + 44, { width: midW, align: 'center', lineBreak: false });
      doc.fillOpacity(1);

      // Right: Bootstrap icons + contacts
      const rx     = div2X + 12;
      const rw     = M + PW - rx - 4;
      const iconSz = 10;
      const iconSc = iconSz / 16;

      function drawContactIcon(paths: string[], ix: number, iy: number) {
        if (!paths.length) return;
        doc.save();
        doc.transform(iconSc, 0, 0, iconSc, ix, iy);
        for (const d of paths) { doc.path(d).fillColor('#4880B8').fill(); }
        doc.restore();
      }

      const contacts = [
        { paths: icPhone, text: '+380 99 199 77 88',   ry: y0 + 13 },
        { paths: icMail,  text: 'info@fixline.com.ua', ry: y0 + 30 },
        { paths: icGlobe, text: 'fixline.com.ua',      ry: y0 + 47 },
      ];
      for (const c of contacts) {
        drawContactIcon(c.paths, rx, c.ry);
        doc.font('R').fontSize(9).fillColor('#fff').fillOpacity(0.9)
           .text(c.text, rx + iconSz + 5, c.ry, { width: rw - iconSz - 5, lineBreak: false });
      }
      doc.fillOpacity(1);

      // Logo PNG (pre-rendered with Inter font, embedded as base64)
      if (logoBuf) {
        try { doc.image(logoBuf, logoX, logoY, { height: LOGO_H, width: LOGO_W }); }
        catch { /* logo failed to embed — continue without it */ }
      }

      doc.y = y0 + H + 8;
    }
    drawPageHeader();

    // ── Column headers ──────────────────────────────────────────────────────────
    const COL_H = 15;
    function drawColHeaders(y: number) {
      doc.rect(M, y, PW, COL_H).fill('#DBEAFE');
      doc.font('B').fontSize(7).fillColor('#1E3A5F');
      let x = M;
      if (showImages) { doc.text('', x, y + 4, { width: C_IMG, lineBreak: false }); x += C_IMG; }
      doc.text('НАЗВА', x + 3, y + 4, { width: C_NAME - 6, lineBreak: false }); x += C_NAME;
      if (showBrand) { doc.text('БРЕНД', x + 2, y + 4, { width: C_BRAND - 4, lineBreak: false }); x += C_BRAND; }
      doc.text("ОБ'ЄМ", x, y + 4, { width: C_VOL, align: 'center', lineBreak: false }); x += C_VOL;
      doc.text('ЦІНА (₴)', x, y + 4, { width: C_PRICE, align: 'right', lineBreak: false });
      doc.moveTo(M, y + COL_H).lineTo(M + PW, y + COL_H).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
    }

    // ── Data row ───────────────────────────────────────────────────────────────
    function calcRowH(row: PdfRow): number {
      doc.font('R').fontSize(8);
      const nameH = doc.heightOfString(row.name, { width: C_NAME - 8 });
      const minH  = row.price_promo != null ? 34 : 28;
      const textH = Math.max(minH, nameH + 16);
      return showImages ? Math.max(46, textH) : textH;
    }

    function drawRow(y: number, rh: number, row: PdfRow, shade: boolean) {
      if (shade) doc.rect(M, y, PW, rh).fill('#F9FAFB');
      let x = M;

      if (showImages) {
        const buf = imageBuffers.get(row.sku);
        if (buf) {
          try {
            const imgSize = Math.min(rh - 6, C_IMG - 4);
            const ix = x + (C_IMG - imgSize) / 2;
            const iy = y + (rh - imgSize) / 2;
            doc.save();
            doc.roundedRect(ix, iy, imgSize, imgSize, 4).clip();
            doc.image(buf, ix, iy, { width: imgSize, height: imgSize, fit: [imgSize, imgSize], align: 'center', valign: 'center' });
            doc.restore();
          } catch { /* skip */ }
        } else {
          doc.roundedRect(x + 6, y + (rh - 28) / 2, C_IMG - 12, 28, 4).fill('#F1F5F9');
        }
        x += C_IMG;
      }

      const lineH = 8;
      const cy    = y + (rh - lineH) / 2;

      // Name + SKU
      const nameX   = x + 3;
      const nameW   = C_NAME - 6;
      doc.font('R').fontSize(8);
      const nameH2  = doc.heightOfString(row.name, { width: nameW });
      const nameTop = y + Math.max(3, (rh - nameH2 - 9) / 2);
      doc.font('R').fontSize(8).fillColor('#111')
         .text(row.name, nameX, nameTop, { width: nameW, lineBreak: true });
      doc.font('R').fontSize(6.5).fillColor('#9CA3AF')
         .text(row.sku, nameX, nameTop + nameH2 + 1, { width: nameW, lineBreak: false });
      x += C_NAME;

      if (showBrand) {
        doc.font('R').fontSize(7.5).fillColor('#374151')
           .text(row.brand ?? '', x + 2, cy, { width: C_BRAND - 4, lineBreak: false, ellipsis: true });
        x += C_BRAND;
      }

      doc.font('R').fontSize(8).fillColor('#374151')
         .text(row.volume ?? '', x, cy, { width: C_VOL, align: 'center', lineBreak: false });
      x += C_VOL;

      if (row.price_promo != null && row.price != null) {
        const regStr = row.price.toLocaleString('uk-UA') + ' ₴';
        doc.font('R').fontSize(7).fillColor('#94A3B8')
           .text(regStr, x, cy - 9, { width: C_PRICE - 2, align: 'right', lineBreak: false, strike: true });
        const promoStr = row.price_promo.toLocaleString('uk-UA');
        doc.font('B').fontSize(8.5);
        const pNumW  = doc.widthOfString(promoStr);
        doc.font('R').fontSize(7.5);
        const pSymW  = doc.widthOfString(' ₴');
        const pStartX = x + C_PRICE - pNumW - pSymW - 2;
        doc.font('B').fontSize(8.5).fillColor('#DC2626').text(promoStr, pStartX, cy + 2, { lineBreak: false });
        doc.font('R').fontSize(7.5).fillColor('#FCA5A5').text(' ₴', pStartX + pNumW, cy + 3, { lineBreak: false });
      } else if (row.price != null) {
        const priceStr = row.price.toLocaleString('uk-UA');
        doc.font('B').fontSize(8.5);
        const numW  = doc.widthOfString(priceStr);
        doc.font('R').fontSize(7.5);
        const symW  = doc.widthOfString(' ₴');
        const startX = x + C_PRICE - numW - symW - 2;
        doc.font('B').fontSize(8.5).fillColor('#1E3A5F').text(priceStr, startX, cy - 0.5, { lineBreak: false });
        doc.font('R').fontSize(7.5).fillColor('#94A3B8').text(' ₴', startX + numW, cy + 0.5, { lineBreak: false });
      } else {
        doc.font('R').fontSize(8).fillColor('#9CA3AF').text('—', x, cy, { width: C_PRICE, align: 'right', lineBreak: false });
      }

      doc.moveTo(M, y + rh).lineTo(M + PW, y + rh).strokeColor('#F1F5F9').lineWidth(0.4).stroke();
      doc.y = y + rh;
    }

    // ── Categories ─────────────────────────────────────────────────────────────
    for (const [, { catName, description, rows }] of grouped) {
      if (doc.y + 60 > BOTTOM) { doc.addPage(); drawPageHeader(); }

      const catY  = doc.y;
      const CAT_H = 20;
      doc.rect(M, catY, PW, CAT_H).fill('#1D4E8B');
      doc.rect(M, catY, 4, CAT_H).fill('#4880B8');
      doc.font('B').fontSize(9).fillColor('#fff')
         .text(catName, M + 12, catY + 6, { width: PW - 20, lineBreak: false });
      doc.y = catY + CAT_H + 2;

      if (showDescriptions && description.trim()) {
        doc.font('R').fontSize(8).fillColor('#6B7280')
           .text(description, M + 4, doc.y, { width: PW - 8, lineBreak: true });
        doc.moveDown(0.2);
      }

      drawColHeaders(doc.y);
      doc.y += COL_H;

      rows.forEach((r, i) => {
        const rh = calcRowH(r);
        if (doc.y + rh > BOTTOM) {
          doc.addPage(); drawPageHeader(); drawColHeaders(doc.y); doc.y += COL_H;
        }
        drawRow(doc.y, rh, r, i % 2 === 1);
      });

      doc.moveDown(0.8);
    }

    // ── Footer on every page ───────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const fy = 841.89 - 24;
      doc.moveTo(M, fy).lineTo(M + PW, fy).strokeColor('#E2E8F0').lineWidth(0.4).stroke();
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('R').fontSize(7).fillColor('#9CA3AF')
         .text(`fixline.com.ua  ·  Прайс-лист ${date}  ·  Стор. ${i + 1} / ${range.count}`,
               M, fy + 5, { width: PW, align: 'center', lineBreak: false });
      doc.page.margins.bottom = savedBottom;
    }

    doc.end();
  });
}
