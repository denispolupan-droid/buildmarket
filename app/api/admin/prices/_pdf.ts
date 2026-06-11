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

  const logoBuf = (() => {
    try { return readFileSync(join(process.cwd(), 'public', 'fixline-logo-white.png')); }
    catch { return null; }
  })();

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

      // Logo PNG (fixline-logo-white.png — pre-rendered with Inter font)
      if (logoBuf) {
        doc.image(logoBuf, logoX, logoY, { height: LOGO_H, width: LOGO_W });
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
