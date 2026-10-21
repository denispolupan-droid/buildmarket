import { hryvniaInWords } from "./number-to-words";
import PDFDocument from 'pdfkit';
import path from 'path';
import { shortFio, type Signer } from './signatory';
import type { VidatkovaRenderParams } from './vidatkova-doc';
import { formatMoney, formatQty, formatDocDate, taxIdLabel } from './doc-format';

// Liberation Sans — метрики Arial (як у друкованих формах 1С), SIL OFL.
const FONT_R = path.join(process.cwd(), 'public', 'fonts', 'LiberationSans-Regular.ttf');
const FONT_B = path.join(process.cwd(), 'public', 'fonts', 'LiberationSans-Bold.ttf');

function formatIban(raw: string): string {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

export async function buildVidatkovaPdf(params: VidatkovaRenderParams): Promise<Buffer> {
  const {
    docNumber, docDate, lines, total,
    sellerName, sellerEdrpou, sellerAddress, sellerCity, sellerBank, sellerIban, sellerTaxStatus,
    buyerName, buyerPhone, buyerEdrpou, buyerAddress, orderNumber, contract,
    sellerSigner, buyerSigner,
  } = params;

  const ibanDisplay = formatIban(sellerIban);
  const date = formatDocDate(docDate);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', FONT_R);
    doc.registerFont('B', FONT_B);

    const ML = 28;
    const CW = 595 - ML - 28;
    const TOP = 26;
    const BOTTOM = 842 - 34; // нижня межа вмісту; під нею — номер сторінки
    let y = TOP;

    function fillRect(x: number, yy: number, w: number, h: number, color: string) {
      doc.save().rect(x, yy, w, h).fillColor(color).fill().restore();
    }
    function strokeRect(x: number, yy: number, w: number, h: number, color: string, lw = 0.4) {
      doc.save().rect(x, yy, w, h).lineWidth(lw).strokeColor(color).stroke().restore();
    }
    function hline(x1: number, y1: number, x2: number, color: string, lw = 0.4) {
      doc.save().moveTo(x1, y1).lineTo(x2, y1).lineWidth(lw).strokeColor(color).stroke().restore();
    }
    function vline(x1: number, y1: number, y2: number, color: string, lw = 0.4) {
      doc.save().moveTo(x1, y1).lineTo(x1, y2).lineWidth(lw).strokeColor(color).stroke().restore();
    }
    function mh(text: string, width: number, size: number, font: 'R' | 'B' = 'R'): number {
      return doc.font(font).fontSize(size).heightOfString(text, { width });
    }
    /** Якщо блок висотою h не влазить — нова сторінка. */
    function ensureSpace(h: number) {
      if (y + h > BOTTOM) { doc.addPage(); y = TOP; }
    }

    // ── 1. Title ────────────────────────────────────────────────────────────
    doc.font('B').fontSize(13).fillColor('#111111')
       .text(`Видаткова накладна № ${docNumber} від ${date}`, ML, y, { width: CW, lineBreak: false });
    y += 18;
    // Місце складання, договір і підстава — одним рядком через «·»
    const subtitle = [
      sellerCity ? `Місце складання: ${sellerCity}` : null,
      contract ? `Договір ${contract}` : null,
      orderNumber ? `Підстава: замовлення №${orderNumber}` : null,
    ].filter(Boolean).join(' · ');
    if (subtitle) {
      doc.font('R').fontSize(8.5).fillColor('#555555').text(subtitle, ML, y, { width: CW, lineBreak: false });
      y += 13;
    }
    hline(ML, y, ML + CW, '#111111', 1.2);
    y += 8;

    // ── 2. Parties ──────────────────────────────────────────────────────────
    const LABEL_W = 90;
    const VAL_X   = ML + LABEL_W + 4;
    const VAL_W   = CW - LABEL_W - 4;

    function drawParty(
      label: string,
      rows: Array<{ text: string; bold?: boolean; color?: string }>,
      yy: number,
    ): number {
      doc.font('B').fontSize(9).fillColor('#111111').text(label, ML, yy, { width: LABEL_W, lineBreak: false });
      let ry = yy;
      for (const l of rows) {
        const font = l.bold ? 'B' : 'R';
        const sz   = l.bold ? 9 : 8.5;
        const clr  = l.color ?? '#111111';
        const lh   = mh(l.text, VAL_W, sz, font);
        doc.font(font).fontSize(sz).fillColor(clr).text(l.text, VAL_X, ry, { width: VAL_W, lineBreak: true });
        ry += lh + 1;
      }
      return ry - yy + 2;
    }

    const supplierRows = [
      { text: sellerName, bold: true },
      ...(sellerEdrpou    ? [{ text: `${taxIdLabel(sellerEdrpou)}: ${sellerEdrpou}`, color: '#444444' }] : []),
      ...(sellerAddress   ? [{ text: `Адреса: ${sellerAddress}`,                     color: '#444444' }] : []),
      ...(sellerBank      ? [{ text: `Банк: ${sellerBank}`,                          color: '#444444' }] : []),
      ...(sellerIban      ? [{ text: `IBAN: ${ibanDisplay}`,                         color: '#444444' }] : []),
      ...(sellerTaxStatus ? [{ text: sellerTaxStatus,                                color: '#444444' }] : []),
    ];
    y += drawParty('Постачальник:', supplierRows, y) + 2;
    hline(ML, y, ML + CW, '#cccccc');
    y += 5;

    const buyerRows = [
      { text: buyerName, bold: true },
      ...(buyerEdrpou  ? [{ text: `${taxIdLabel(buyerEdrpou)}: ${buyerEdrpou}`, color: '#444444' }] : []),
      ...(buyerAddress ? [{ text: `Адреса: ${buyerAddress}`,                    color: '#444444' }] : []),
      ...(buyerPhone   ? [{ text: `Тел.: ${buyerPhone}`,                        color: '#444444' }] : []),
    ];
    y += drawParty('Покупець:', buyerRows, y) + 8;

    // ── 3. Items table ──────────────────────────────────────────────────────
    // Як у друкованих формах 1С: тонкі чорні рамки, сіра шапка, без «зебри».
    // Cols: 22+62+235+54+30+64+72 = 539 = CW
    const C = [
      { x: ML,      w: 22,  label: '№' },
      { x: ML+22,   w: 62,  label: 'Код' },
      { x: ML+84,   w: 235, label: 'Найменування товару' },
      { x: ML+319,  w: 54,  label: 'Кількість' },
      { x: ML+373,  w: 30,  label: 'Од.' },
      { x: ML+403,  w: 64,  label: 'Ціна, грн' },
      { x: ML+467,  w: 72,  label: 'Сума, грн' },
    ];
    const BORDER = '#000000';
    const HDR = 20;

    function drawHeader() {
      fillRect(ML, y, CW, HDR, '#F2F2F2');
      strokeRect(ML, y, CW, HDR, BORDER, 0.5);
      for (const col of C) {
        vline(col.x, y, y + HDR, BORDER, 0.5);
        doc.font('B').fontSize(8).fillColor('#111111').text(
          col.label, col.x + 2, y + (HDR - 9) / 2, { width: col.w - 4, align: 'center', lineBreak: false },
        );
      }
      y += HDR;
    }

    drawHeader();
    for (let idx = 0; idx < lines.length; idx++) {
      const item = lines[idx];
      const nameH = mh(item.name, C[2].w - 8, 8.5);
      const ROW = Math.max(nameH + 7, 17);

      // Рядок не влазить — переносимо на нову сторінку з повтором шапки.
      if (y + ROW > BOTTOM) { doc.addPage(); y = TOP; drawHeader(); }

      strokeRect(ML, y, CW, ROW, BORDER, 0.5);
      for (const col of C) vline(col.x, y, y + ROW, BORDER, 0.5);

      const midY = y + (ROW - 9) / 2;
      doc.font('R').fontSize(8.5).fillColor('#111111');
      doc.text(String(idx + 1),                      C[0].x+2, midY, { width: C[0].w-4, align: 'center', lineBreak: false });
      doc.fontSize(8).text(item.sku,                  C[1].x+3, midY, { width: C[1].w-6, align: 'center', lineBreak: false });
      doc.fontSize(8.5).text(item.name,               C[2].x+4, y+4,  { width: C[2].w-8, lineBreak: true });
      doc.text(formatQty(item.qty),                   C[3].x+2, midY, { width: C[3].w-6, align: 'right',  lineBreak: false });
      doc.text(item.unit,                             C[4].x+2, midY, { width: C[4].w-4, align: 'center', lineBreak: false });
      doc.text(formatMoney(item.price),               C[5].x+2, midY, { width: C[5].w-6, align: 'right',  lineBreak: false });
      doc.text(formatMoney(item.qty * item.price),    C[6].x+2, midY, { width: C[6].w-6, align: 'right',  lineBreak: false });
      y += ROW;
    }

    // ── 4. Totals + sum in words ────────────────────────────────────────────
    const words = `${hryvniaInWords(total)}, без ПДВ`;
    const wordsH = mh(words, CW, 9, 'B');
    ensureSpace(18 + 14 + wordsH + 10);
    y += 4;
    doc.font('B').fontSize(9).fillColor('#111111')
       .text('Разом без ПДВ:', ML, y, { width: C[6].x - ML - 8, align: 'right', lineBreak: false })
       .text(formatMoney(total), C[6].x + 2, y, { width: C[6].w - 6, align: 'right', lineBreak: false });
    y += 18;
    doc.font('R').fontSize(8.5).fillColor('#111111')
       .text(`Всього найменувань: ${lines.length}, на суму ${formatMoney(total)} грн`, ML, y, { width: CW, lineBreak: false });
    y += 14;
    doc.font('B').fontSize(9).fillColor('#111111').text(words, ML, y, { width: CW, lineBreak: true });
    y += wordsH + 10;

    // ── 5. Signatures ────────────────────────────────────────────────────────
    // Як на онлайн-сторінці: посада над лінією, лінія вільна під живий підпис,
    // ПІБ (розшифровка) праворуч від неї, нижче М.П. з місцем під печатку.
    // Блок ~95pt заввишки — якщо не влазить, переносимо на нову сторінку.
    y += 8;
    ensureSpace(95);
    const SIG_BLOCK_W = 240;
    const leftX  = ML;
    const rightX = ML + CW - SIG_BLOCK_W;

    function drawSignature(bx: number, label: string, signer: Signer | null | undefined) {
      const caption = (text: string, x: number, w: number, top: number) =>
        doc.font('R').fontSize(7).fillColor('#9CA3AF').text(text, x, top, { width: w, align: 'center', lineBreak: false });
      let by = y;
      doc.font('B').fontSize(9).fillColor('#111111').text(`${label}:`, bx, by, { lineBreak: false });
      by += 15;
      const position = signer?.position?.trim();
      if (position) {
        doc.font('R').fontSize(9).fillColor('#111111').text(position, bx, by, { width: SIG_BLOCK_W, lineBreak: false });
        by += 20;
      } else {
        hline(bx, by + 10, bx + SIG_BLOCK_W, '#000000', 0.7);
        caption('(посада)', bx, SIG_BLOCK_W, by + 12);
        by += 24;
      }
      const name = signer?.name ? shortFio(signer.name) : '';
      doc.font('R').fontSize(9);
      const nameW = name ? doc.widthOfString(name) : 100;
      const lineX2 = bx + SIG_BLOCK_W - nameW - 10;
      hline(bx, by + 12, lineX2, '#000000', 0.7);
      caption('(підпис)', bx, lineX2 - bx, by + 14);
      if (name) {
        doc.font('R').fontSize(9).fillColor('#111111').text(name, lineX2 + 10, by + 2, { lineBreak: false });
      } else {
        hline(lineX2 + 10, by + 12, bx + SIG_BLOCK_W, '#000000', 0.7);
        caption('(прізвище, ініціали)', lineX2 + 10, nameW, by + 14);
      }
      doc.font('R').fontSize(8.5).fillColor('#555555').text('М.П.', bx, by + 32, { lineBreak: false });
    }

    drawSignature(leftX,  'Відпустив(ла)', sellerSigner);
    drawSignature(rightX, 'Отримав(ла)',   buyerSigner);

    // Номери сторінок — лише коли накладна не вмістилась на одну.
    const range = doc.bufferedPageRange();
    if (range.count > 1) {
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.font('R').fontSize(7.5).fillColor('#777777').text(
          `Видаткова накладна № ${docNumber} · сторінка ${i + 1} з ${range.count}`,
          ML, 842 - 22, { width: CW, align: 'right', lineBreak: false },
        );
      }
    }

    doc.end();
  });
}
