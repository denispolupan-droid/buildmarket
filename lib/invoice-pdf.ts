import { hryvniaInWords } from "./number-to-words";
import PDFDocument from 'pdfkit';
import path from 'path';

type Item = { sku: string; name: string; brand?: string | null; qty: number; price: number };
type Order = {
  order_number: number;
  created_at: string;
  company?: string | null;
  contact: string;
  phone?: string | null;
  delivery_address?: string | null;
  delivery_city_name?: string | null;
  items: Item[];
  total_price: number;
  payment_due_date?: string | null;
};

const FONT_R = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf');
const FONT_B = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans-Bold.ttf');

function formatIban(raw: string): string {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

export async function buildInvoicePdf(params: {
  order: Order;
  bankRecipient: string;
  bankIban: string;
  bankName: string;
  bankEdrpou: string;
  bankAddress?: string;
  signatoryName?: string;
}): Promise<Buffer> {
  const { order, bankRecipient, bankIban, bankName, bankEdrpou, bankAddress = '', signatoryName = '' } = params;

  const ibanDisplay = formatIban(bankIban);
  const date = new Date(order.created_at).toLocaleDateString('uk-UA', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const buyerName   = order.company || order.contact;
  const total       = Number(order.total_price);
  const items       = order.items as Item[];
  const dueDateStr  = order.payment_due_date
    ? new Date(order.payment_due_date).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;
  const deliveryAddr = [order.delivery_city_name, order.delivery_address].filter(Boolean).join(', ');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', FONT_R);
    doc.registerFont('B', FONT_B);

    // Layout constants (points; 1pt ≈ 0.352mm; A4 = 595×842pt)
    const ML = 28;          // left margin
    const CW = 595 - ML - 28;  // content width = 539
    let y = 22;

    // ── Drawing helpers ────────────────────────────────────────────────────

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

    // ── 1. Warning ──────────────────────────────────────────────────────────

    const warnText = "Увага! Сплата даного рахунку означає згоду з умовами постачання товару. "
      + "Повідомлення про сплату обов’язкове, інакше не гарантується наявність товару на складі. "
      + "Товар відпускається за фактом приходу грошей на п/р Постачальника.";
    const warnH = mh(warnText, CW - 16, 8) + 12;
    fillRect(ML, y, CW, warnH, '#FAFBFC');
    strokeRect(ML, y, CW, warnH, '#CBD5E1');
    doc.font('R').fontSize(8).fillColor('#4A5568').text(warnText, ML + 8, y + 6, {
      width: CW - 16, align: 'center', lineBreak: true,
    });
    y += warnH + 8;

    // ── 2. Payment sample ───────────────────────────────────────────────────

    const HDR_H = 16;
    const recipH = mh(bankRecipient, CW * 0.62, 10, 'B');
    const bankLineH = mh(bankName, CW - 20, 9);
    const sampContentH = 8 + 10 + Math.max(recipH, 12) + 6 + 10 + Math.max(bankLineH, 11) + 6 + 10 + 20 + 8;

    fillRect(ML, y, CW, HDR_H, '#DCE8F5');
    fillRect(ML, y + HDR_H, CW, sampContentH, '#F4F8FD');
    strokeRect(ML, y, CW, HDR_H + sampContentH, '#C5D5E8');
    doc.font('B').fontSize(7.5).fillColor('#3D5A80')
       .text('ЗРАЗОК ЗАПОВНЕННЯ ПЛАТІЖНОГО ДОРУЧЕННЯ', ML + 10, y + 5, { lineBreak: false });
    y += HDR_H;

    let cy = y + 8;
    // Одержувач + ЄДРПОУ labels
    doc.font('R').fontSize(7).fillColor('#6B7E99').text('ОДЕРЖУВАЧ', ML + 10, cy, { lineBreak: false });
    if (bankEdrpou) doc.font('R').fontSize(7).fillColor('#6B7E99').text('ЄДРПОУ / ДРФО', ML + CW * 0.67, cy, { lineBreak: false });
    cy += 10;
    doc.font('B').fontSize(10).fillColor('#111111').text(bankRecipient, ML + 10, cy, { width: CW * 0.62, lineBreak: true });
    if (bankEdrpou) doc.font('B').fontSize(10).fillColor('#111111').text(bankEdrpou, ML + CW * 0.67, cy, { lineBreak: false });
    cy += Math.max(recipH, 12) + 6;

    doc.font('R').fontSize(7).fillColor('#6B7E99').text('БАНК ОДЕРЖУВАЧА', ML + 10, cy, { lineBreak: false });
    cy += 10;
    doc.font('R').fontSize(9).fillColor('#222222').text(bankName, ML + 10, cy, { width: CW - 20, lineBreak: false });
    cy += Math.max(bankLineH, 11) + 6;

    doc.font('R').fontSize(7).fillColor('#6B7E99').text('РАХУНОК (IBAN)', ML + 10, cy, { lineBreak: false });
    cy += 10;
    doc.font('B').fontSize(14).fillColor('#1E3A5F').text(ibanDisplay, ML + 10, cy, { lineBreak: false });
    cy += 20;

    y += sampContentH + 12;

    // ── 3. Title ────────────────────────────────────────────────────────────

    doc.font('B').fontSize(14).fillColor('#111111')
       .text(`Рахунок на оплату № ${order.order_number} від ${date}`, ML, y, { width: CW, lineBreak: false });
    y += 18;
    hline(ML, y, ML + CW, '#1E3A5F', 1.5);
    y += 8;

    // ── 4. Parties ──────────────────────────────────────────────────────────

    const LABEL_W = 100;
    const VAL_X   = ML + LABEL_W + 4;
    const VAL_W   = CW - LABEL_W - 4;

    function drawParty(
      label: string,
      lines: Array<{ text: string; bold?: boolean; color?: string }>,
      yy: number,
    ): number {
      doc.font('B').fontSize(9).fillColor('#111111').text(label, ML, yy, { width: LABEL_W, lineBreak: false });
      let ry = yy;
      for (const l of lines) {
        const font = l.bold ? 'B' : 'R';
        const sz   = l.bold ? 9 : 8.5;
        const clr  = l.color ?? '#111111';
        const lh   = mh(l.text, VAL_W, sz, font);
        doc.font(font).fontSize(sz).fillColor(clr).text(l.text, VAL_X, ry, { width: VAL_W, lineBreak: true });
        ry += lh;
      }
      return ry - yy + 2;
    }

    const supplierLines = [
      { text: bankRecipient, bold: true },
      ...(bankEdrpou  ? [{ text: `ЄДРПОУ/ДРФО: ${bankEdrpou}`, color: '#555555' }] : []),
      ...(bankAddress ? [{ text: `Адреса: ${bankAddress}`, color: '#555555' }] : []),
      ...(bankName    ? [{ text: `Банк: ${bankName}`, color: '#555555' }] : []),
      ...(bankIban    ? [{ text: `IBAN: ${ibanDisplay}`, color: '#1E3A5F', bold: true }] : []),
    ];
    y += drawParty('Постачальник:', supplierLines, y) + 2;
    hline(ML, y, ML + CW, '#cccccc');
    y += 4;

    const buyerLines = [
      { text: buyerName, bold: true },
      ...(order.company && order.contact !== order.company ? [{ text: order.contact }] : []),
      ...(order.phone ? [{ text: `Тел.: ${order.phone}`, color: '#555555' }] : []),
    ];
    y += drawParty('Покупець:', buyerLines, y) + 2;

    if (dueDateStr || deliveryAddr) { hline(ML, y, ML + CW, '#cccccc'); y += 4; }
    if (dueDateStr) { drawParty('Строк оплати:', [{ text: `до ${dueDateStr}`, color: '#B45309', bold: true }], y); y += 16; }
    if (deliveryAddr) { drawParty('Адреса доставки:', [{ text: deliveryAddr }], y); y += 16; }
    y += 6;

    // ── 5. Items table ──────────────────────────────────────────────────────

    // Column widths: 22+68+233+52+28+68+68 = 539 = CW
    const C = [
      { x: ML,       w: 22,  label: '№',                  al: 'center' as const },
      { x: ML+22,    w: 68,  label: 'Код',                 al: 'center' as const },
      { x: ML+90,    w: 233, label: 'Найменування товару', al: 'left'   as const },
      { x: ML+323,   w: 52,  label: 'Кількість',           al: 'center' as const },
      { x: ML+375,   w: 28,  label: 'Од.',                 al: 'center' as const },
      { x: ML+403,   w: 68,  label: 'Ціна',                al: 'right'  as const },
      { x: ML+471,   w: 68,  label: 'Сума',                al: 'right'  as const },
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

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const nameText = [item.brand, item.name].filter(Boolean).join(' ');
      const nameH = mh(nameText, C[2].w - 8, 8.5);
      const ROW = Math.max(nameH + 8, 18);
      const bg  = idx % 2 === 1 ? '#F8FAFC' : '#ffffff';

      fillRect(ML, y, CW, ROW, bg);
      strokeRect(ML, y, CW, ROW, '#cccccc', 0.3);
      for (const col of C) vline(col.x, y, y + ROW, '#cccccc', 0.3);

      const midY = y + (ROW - 9) / 2;
      doc.font('R').fontSize(8.5).fillColor('#111').text(String(idx+1),              C[0].x+2,  midY, { width: C[0].w-4,  align: 'center', lineBreak: false });
      doc.font('R').fontSize(7.5).fillColor('#555').text(item.sku,                   C[1].x+4,  midY, { width: C[1].w-8,  align: 'center', lineBreak: false });
      doc.font('R').fontSize(8.5).fillColor('#111').text(nameText,                   C[2].x+4,  y+4,  { width: C[2].w-8,  lineBreak: true  });
      doc.font('R').fontSize(8.5).fillColor('#111').text(String(item.qty),           C[3].x+2,  midY, { width: C[3].w-4,  align: 'right',  lineBreak: false });
      doc.font('R').fontSize(8  ).fillColor('#777').text('шт',                       C[4].x+2,  midY, { width: C[4].w-4,  align: 'center', lineBreak: false });
      doc.font('R').fontSize(8.5).fillColor('#111').text(Number(item.price).toFixed(2), C[5].x+2, midY, { width: C[5].w-6, align: 'right', lineBreak: false });
      doc.font('B').fontSize(8.5).fillColor('#111').text((item.qty * Number(item.price)).toFixed(2), C[6].x+2, midY, { width: C[6].w-6, align: 'right', lineBreak: false });
      y += ROW;
    }

    // Total row
    const TOT = 18;
    fillRect(ML, y, CW, TOT, '#ffffff');
    strokeRect(ML, y, CW, TOT, '#cccccc', 0.5);
    vline(C[6].x, y, y + TOT, '#cccccc', 0.3);
    doc.font('R').fontSize(8.5).fillColor('#555').text('Всього без ПДВ:', ML+4, y+4, { width: C[6].x-ML-8, align: 'right', lineBreak: false });
    doc.font('B').fontSize(8.5).fillColor('#111').text(total.toFixed(2),  C[6].x+2, y+4, { width: C[6].w-6, align: 'right', lineBreak: false });
    y += TOT + 6;

    // ── 6. Sum in words ─────────────────────────────────────────────────────

    const sumLine = `Всього найменувань: ${items.length}, на суму ${total.toFixed(2)} грн`;
    doc.font('R').fontSize(9).fillColor('#333').text(sumLine, ML, y, { lineBreak: false });
    y += 13;
    doc.font('R').fontSize(8.5).fillColor('#555').text(hryvniaInWords(total), ML, y, { width: CW, lineBreak: false });
    y += 14;

    // ── 7. Payment purpose ──────────────────────────────────────────────────

    const purposeLabel = 'Призначення платежу:';
    const purposeValue = ` Оплата за замовлення №${order.order_number} від ${date}. Без ПДВ.`;
    const labelW2 = doc.font('B').fontSize(9).widthOfString(purposeLabel);
    const purposeH = mh(purposeValue, CW - 16 - labelW2, 9) + 12;
    fillRect(ML, y, CW, purposeH, '#F9FAFB');
    strokeRect(ML, y, CW, purposeH, '#D1D5DB');
    doc.font('B').fontSize(9).fillColor('#333').text(purposeLabel, ML+8, y+6, { lineBreak: false });
    doc.font('R').fontSize(9).fillColor('#333').text(purposeValue, ML+8+labelW2, y+6, { width: CW-16-labelW2, lineBreak: true });
    y += purposeH + 14;

    // ── 8. Signature ────────────────────────────────────────────────────────

    const sigLabelX = ML + CW - 220;
    doc.font('R').fontSize(9).fillColor('#111').text('Виписав(ла):', sigLabelX, y, { lineBreak: false });
    const lineX1 = sigLabelX + 82;
    const lineX2 = ML + CW;
    hline(lineX1, y + 11, lineX2, '#000000', 0.5);
    if (signatoryName) {
      doc.font('R').fontSize(9).fillColor('#111').text(signatoryName, lineX1, y, { width: lineX2 - lineX1, align: 'center', lineBreak: false });
    } else {
      doc.font('R').fontSize(7.5).fillColor('#9CA3AF').text('(підпис, прізвище)', lineX1, y + 13, { width: lineX2 - lineX1, align: 'center', lineBreak: false });
    }

    doc.end();
  });
}
