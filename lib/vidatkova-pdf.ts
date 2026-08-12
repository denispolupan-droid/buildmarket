import { hryvniaInWords } from "./number-to-words";
import PDFDocument from 'pdfkit';
import path from 'path';

type PrintLine = { sku: string; name: string; qty: number; price: number };

const FONT_R = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf');
const FONT_B = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans-Bold.ttf');

function formatIban(raw: string): string {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

export async function buildVidatkovaPdf(params: {
  docNumber: string;
  docDate: string;
  lines: PrintLine[];
  total: number;
  sellerName: string;
  sellerEdrpou: string;
  sellerAddress: string;
  sellerCity?: string;
  sellerBank: string;
  sellerIban: string;
  buyerName: string;
  buyerPhone?: string | null;
  buyerEdrpou?: string | null;
  buyerAddress?: string | null;
  orderNumber?: number | null;
  signatoryName?: string;
}): Promise<Buffer> {
  const {
    docNumber, docDate, lines, total,
    sellerName, sellerEdrpou, sellerAddress, sellerCity, sellerBank, sellerIban,
    buyerName, buyerPhone, buyerEdrpou, buyerAddress, orderNumber, signatoryName = '',
  } = params;

  const ibanDisplay = formatIban(sellerIban);
  const date = new Date(docDate).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });

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
    let y = 26;

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

    // ── 1. Title ────────────────────────────────────────────────────────────
    doc.font('B').fontSize(14).fillColor('#111111')
       .text(`Видаткова накладна № ${docNumber} від ${date}`, ML, y, { width: CW, lineBreak: false });
    y += 18;
    // Місце складання і підстава — одним рядком через «·» (рішення власника)
    const subtitle = [
      sellerCity ? `Місце складання: ${sellerCity}` : null,
      orderNumber ? `Підстава: замовлення №${orderNumber}` : null,
    ].filter(Boolean).join(' · ');
    if (subtitle) {
      doc.font('R').fontSize(9).fillColor('#555555').text(subtitle, ML, y, { lineBreak: false });
      y += 13;
    }
    hline(ML, y, ML + CW, '#1E3A5F', 1.5);
    y += 8;

    // ── 2. Parties ──────────────────────────────────────────────────────────
    const LABEL_W = 100;
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
        ry += lh;
      }
      return ry - yy + 2;
    }

    const supplierRows = [
      { text: sellerName, bold: true },
      ...(sellerEdrpou  ? [{ text: `ЄДРПОУ/ДРФО: ${sellerEdrpou}`,   color: '#555555' }] : []),
      ...(sellerAddress ? [{ text: `Адреса: ${sellerAddress}`,         color: '#555555' }] : []),
      ...(sellerBank    ? [{ text: `Банк: ${sellerBank}`,              color: '#555555' }] : []),
      ...(sellerIban    ? [{ text: `IBAN: ${ibanDisplay}`,             color: '#1E3A5F', bold: true }] : []),
    ];
    y += drawParty('Постачальник:', supplierRows, y) + 2;
    hline(ML, y, ML + CW, '#cccccc');
    y += 4;

    const buyerRows = [
      { text: buyerName, bold: true },
      ...(buyerEdrpou ? [{ text: `ЄДРПОУ/ДРФО: ${buyerEdrpou}`, color: '#555555' }] : []),
      ...(buyerAddress ? [{ text: `Адреса: ${buyerAddress}`, color: '#555555' }] : []),
      ...(buyerPhone  ? [{ text: `Тел.: ${buyerPhone}`,           color: '#555555' }] : []),
    ];
    y += drawParty('Покупець:', buyerRows, y) + 6;

    // ── 3. Items table ──────────────────────────────────────────────────────
    // Cols: 22+68+233+52+28+68+68 = 539 = CW
    const C = [
      { x: ML,      w: 22,  label: '№',               al: 'center' as const },
      { x: ML+22,   w: 68,  label: 'Код',              al: 'center' as const },
      { x: ML+90,   w: 233, label: 'Найменування товару', al: 'left'   as const },
      { x: ML+323,  w: 52,  label: 'Кіл-сть',           al: 'center' as const },
      { x: ML+375,  w: 28,  label: 'Од.',              al: 'center' as const },
      { x: ML+403,  w: 68,  label: 'Ціна',             al: 'right'  as const },
      { x: ML+471,  w: 68,  label: 'Сума',             al: 'right'  as const },
    ];

    const HDR = 20;
    fillRect(ML, y, CW, HDR, '#1E3A5F');
    strokeRect(ML, y, CW, HDR, '#4B6B8F', 0.3);
    for (const col of C) {
      vline(col.x, y, y + HDR, '#4B6B8F', 0.3);
      doc.font('B').fontSize(8).fillColor('#ffffff').text(
        col.label, col.x + 3, y + (HDR - 9.5) / 2, { width: col.w - 6, align: col.al, lineBreak: false },
      );
    }
    y += HDR;

    for (let idx = 0; idx < lines.length; idx++) {
      const item = lines[idx];
      const nameH = mh(item.name, C[2].w - 8, 8.5);
      const ROW = Math.max(nameH + 8, 18);
      const bg  = idx % 2 === 1 ? '#F8FAFC' : '#ffffff';

      fillRect(ML, y, CW, ROW, bg);
      strokeRect(ML, y, CW, ROW, '#cccccc', 0.3);
      for (const col of C) vline(col.x, y, y + ROW, '#cccccc', 0.3);

      const midY = y + (ROW - 9) / 2;
      doc.font('R').fontSize(8.5).fillColor('#111').text(String(idx+1),      C[0].x+2, midY, { width: C[0].w-4, align: 'center', lineBreak: false });
      doc.font('R').fontSize(7.5).fillColor('#555').text(item.sku,            C[1].x+4, midY, { width: C[1].w-8, align: 'center', lineBreak: false });
      doc.font('R').fontSize(8.5).fillColor('#111').text(item.name,           C[2].x+4, y+4,  { width: C[2].w-8, lineBreak: true  });
      doc.font('R').fontSize(8.5).fillColor('#111').text(String(item.qty),    C[3].x+2, midY, { width: C[3].w-4, align: 'right',  lineBreak: false });
      doc.font('R').fontSize(8  ).fillColor('#777').text('шт',                C[4].x+2, midY, { width: C[4].w-4, align: 'center', lineBreak: false });
      doc.font('R').fontSize(8.5).fillColor('#111').text(item.price.toFixed(2), C[5].x+2, midY, { width: C[5].w-6, align: 'right', lineBreak: false });
      doc.font('B').fontSize(8.5).fillColor('#111').text((item.qty * item.price).toFixed(2), C[6].x+2, midY, { width: C[6].w-6, align: 'right', lineBreak: false });
      y += ROW;
    }

    // Total row
    const TOT = 18;
    fillRect(ML, y, CW, TOT, '#ffffff');
    strokeRect(ML, y, CW, TOT, '#cccccc', 0.5);
    vline(C[6].x, y, y + TOT, '#cccccc', 0.3);
    doc.font('R').fontSize(8.5).fillColor('#555').text('Всього без ПДВ:', ML+4, y+4, { width: C[6].x-ML-8, align: 'right', lineBreak: false });
    doc.font('B').fontSize(8.5).fillColor('#111').text(total.toFixed(2), C[6].x+2, y+4, { width: C[6].w-6, align: 'right', lineBreak: false });
    y += TOT + 6;

    // ── 4. Sum in words ─────────────────────────────────────────────────────
    doc.font('R').fontSize(9).fillColor('#333').text(`Всього найменувань: ${lines.length}, на суму ${total.toFixed(2)} грн`, ML, y, { lineBreak: false });
    y += 13;
    doc.font('R').fontSize(8.5).fillColor('#555').text(hryvniaInWords(total), ML, y, { width: CW, lineBreak: false });
    y += 20;

    // ── 5. Signatures ────────────────────────────────────────────────────────
    // Inline, matching the online view: "Відпустив(ла): ____" on the left and
    // "Отримав(ла): ____" on the right, each with a caption beneath — NOT a table.
    y += 8;
    const SIG_BLOCK_W = 250;
    const leftX  = ML;
    const rightX = ML + CW - SIG_BLOCK_W;

    function drawSignature(bx: number, label: string, name: string) {
      doc.font('R').fontSize(9).fillColor('#111111');
      const labelW = doc.widthOfString(label);
      doc.text(label, bx, y, { lineBreak: false });
      const lineX1 = bx + labelW + 8;
      const lineX2 = bx + SIG_BLOCK_W;
      if (name) {
        doc.font('R').fontSize(9).fillColor('#111111')
           .text(name, lineX1, y, { width: lineX2 - lineX1, align: 'center', lineBreak: false });
      }
      hline(lineX1, y + 12, lineX2, '#000000', 0.7);
      doc.font('R').fontSize(7.5).fillColor('#9CA3AF')
         .text('(посада, підпис, прізвище)', bx, y + 15, { width: SIG_BLOCK_W, align: 'right', lineBreak: false });
    }

    drawSignature(leftX,  'Відпустив(ла):', signatoryName);
    drawSignature(rightX, 'Отримав(ла):',   '');

    doc.end();
  });
}
