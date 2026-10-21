import { hryvniaInWords } from "./number-to-words";
import PDFDocument from 'pdfkit';
import { resolveInvoiceBuyer, type InvoiceBuyer } from './invoice-buyer';
import path from 'path';
import { sellerTaxStatus } from './company';
import { formatMoney, formatQty, formatDocDate, taxIdLabel } from './doc-format';
import { invoiceAmountDue, invoiceDate, invoicePurpose, invoiceQrMatrix } from './invoice-doc';
import { shortFio, type Signer } from './signatory';

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
  amount_paid?: number | null;
  payment_due_date?: string | null;
};

// Liberation Sans — метрики Arial (як у друкованих формах 1С), SIL OFL.
const FONT_R = path.join(process.cwd(), 'public', 'fonts', 'LiberationSans-Regular.ttf');
const FONT_B = path.join(process.cwd(), 'public', 'fonts', 'LiberationSans-Bold.ttf');

function formatIban(raw: string): string {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

// PDF рахунку — у бухгалтерському стилі, як видаткова: тонкі чорні рамки, сіра
// шапка таблиці, без кольорових заливок. Екранна версія (/invoice/[id]) лишається
// «приємною», а цей файл друкують і підшивають поруч із накладною.
export async function buildInvoicePdf(params: {
  order: Order;
  bankRecipient: string;
  bankIban: string;
  bankName: string;
  bankEdrpou: string;
  bankAddress?: string;
  signer?: Signer | null;
  buyer?: InvoiceBuyer;
  showDelivery?: boolean;
  showTerms?: boolean;
}): Promise<Buffer> {
  const { order, bankRecipient, bankIban, bankName, bankEdrpou, bankAddress = '', signer, buyer, showDelivery = true, showTerms = true } = params;

  const ibanDisplay = formatIban(bankIban);
  const docDate     = invoiceDate(order);
  const date        = formatDocDate(docDate);
  const b           = buyer ?? resolveInvoiceBuyer(order, null);
  const total       = Number(order.total_price);
  const amountDue   = invoiceAmountDue(order);
  const partlyPaid  = amountDue > 0 && amountDue < total;
  const items       = order.items as Item[];
  const dueDateStr  = order.payment_due_date ? formatDocDate(order.payment_due_date) : null;
  const deliveryAddr = [order.delivery_city_name, order.delivery_address].filter(Boolean).join(', ');
  const purpose     = invoicePurpose(order);
  const qr          = invoiceQrMatrix(order);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', FONT_R);
    doc.registerFont('B', FONT_B);

    // Layout constants (points; 1pt ≈ 0.352mm; A4 = 595×842pt)
    const ML = 28;
    const CW = 595 - ML - 28;  // 539
    const TOP = 24;
    const BOTTOM = 842 - 34;   // нижня межа вмісту; під нею — номер сторінки
    const BORDER = '#000000';
    let y = TOP;

    // ── Drawing helpers ────────────────────────────────────────────────────

    function fillRect(x: number, yy: number, w: number, h: number, color: string) {
      doc.save().rect(x, yy, w, h).fillColor(color).fill().restore();
    }
    function strokeRect(x: number, yy: number, w: number, h: number, color: string, lw = 0.5) {
      doc.save().rect(x, yy, w, h).lineWidth(lw).strokeColor(color).stroke().restore();
    }
    function hline(x1: number, y1: number, x2: number, color: string, lw = 0.5) {
      doc.save().moveTo(x1, y1).lineTo(x2, y1).lineWidth(lw).strokeColor(color).stroke().restore();
    }
    function vline(x1: number, y1: number, y2: number, color: string, lw = 0.5) {
      doc.save().moveTo(x1, y1).lineTo(x1, y2).lineWidth(lw).strokeColor(color).stroke().restore();
    }
    function mh(text: string, width: number, size: number, font: 'R' | 'B' = 'R'): number {
      return doc.font(font).fontSize(size).heightOfString(text, { width });
    }
    function ensureSpace(h: number) {
      if (y + h > BOTTOM) { doc.addPage(); y = TOP; }
    }

    // ── 1. Warning ──────────────────────────────────────────────────────────

    const warnText = "Увага! Сплата даного рахунку означає згоду з умовами постачання товару. "
      + "Повідомлення про сплату обов’язкове, інакше не гарантується наявність товару на складі. "
      + "Товар відпускається за фактом приходу грошей на п/р Постачальника.";
    const warnH = mh(warnText, CW - 16, 7.5) + 10;
    strokeRect(ML, y, CW, warnH, BORDER);
    doc.font('R').fontSize(7.5).fillColor('#111111').text(warnText, ML + 8, y + 5, {
      width: CW - 16, align: 'center', lineBreak: true,
    });
    y += warnH + 8;

    // ── 2. Payment sample + QR ──────────────────────────────────────────────
    // Зразок платіжки зліва, QR НБУ справа. Модуль QR — 1,45 pt (≈0,51 мм ≥ 0,5 мм
    // за Правилами НБУ). Власна «тиха зона» — 2 модулі; разом із відступами до
    // рамки й роздільника білого поля навколо коду ≥ 4 модулі.

    const MOD = 1.45;
    const QUIET = 2;
    const qrSide = qr ? (qr.size + QUIET * 2) * MOD : 0;
    const QR_COL = qr ? qrSide + 14 : 0;
    const textW = CW - QR_COL - 20;
    const colW = textW * 0.6;
    const codeX = ML + 10 + textW * 0.64;

    const HDR_H = 15;
    const recipH = mh(bankRecipient, colW, 9.5, 'B');
    const bankLineH = mh(bankName, colW, 9);
    const purposeSampleH = mh(purpose, textW, 8.5);
    const textH = 8
      + 10 + Math.max(recipH, 12) + 6       // одержувач | код
      + 10 + Math.max(bankLineH, 13) + 6    // банк | сума
      + 10 + 15 + 6                         // IBAN
      + 10 + purposeSampleH + 8;            // призначення
    const qrCaptionH = qr ? 20 : 0;
    const sampContentH = Math.max(textH, qr ? qrSide + qrCaptionH + 8 : 0);

    fillRect(ML, y, CW, HDR_H, '#F2F2F2');
    strokeRect(ML, y, CW, HDR_H + sampContentH, BORDER);
    hline(ML, y + HDR_H, ML + CW, BORDER);
    doc.font('B').fontSize(7.5).fillColor('#111111')
       .text('ЗРАЗОК ЗАПОВНЕННЯ ПЛАТІЖНОГО ДОРУЧЕННЯ', ML + 10, y + 4, { lineBreak: false });
    y += HDR_H;

    let cy = y + 8;
    doc.font('R').fontSize(7).fillColor('#555555').text('ОДЕРЖУВАЧ', ML + 10, cy, { lineBreak: false });
    if (bankEdrpou) doc.text(taxIdLabel(bankEdrpou).toUpperCase(), codeX, cy, { lineBreak: false });
    cy += 10;
    doc.font('B').fontSize(9.5).fillColor('#111111').text(bankRecipient, ML + 10, cy, { width: colW, lineBreak: true });
    if (bankEdrpou) doc.font('B').fontSize(9.5).fillColor('#111111').text(bankEdrpou, codeX, cy, { lineBreak: false });
    cy += Math.max(recipH, 12) + 6;

    doc.font('R').fontSize(7).fillColor('#555555').text('БАНК ОДЕРЖУВАЧА', ML + 10, cy, { lineBreak: false });
    doc.text(partlyPaid ? 'ЗАЛИШОК ДО СПЛАТИ' : 'СУМА ДО СПЛАТИ', codeX, cy, { lineBreak: false });
    cy += 10;
    doc.font('R').fontSize(9).fillColor('#111111').text(bankName, ML + 10, cy, { width: colW, lineBreak: true });
    doc.font('B').fontSize(11).fillColor('#111111')
       .text(amountDue > 0 ? `${formatMoney(amountDue)} грн` : 'Оплачено', codeX, cy - 1, { lineBreak: false });
    cy += Math.max(bankLineH, 13) + 6;

    doc.font('R').fontSize(7).fillColor('#555555').text('РАХУНОК (IBAN)', ML + 10, cy, { lineBreak: false });
    cy += 10;
    doc.font('B').fontSize(12).fillColor('#111111').text(ibanDisplay, ML + 10, cy, { lineBreak: false });
    cy += 15 + 6;

    doc.font('R').fontSize(7).fillColor('#555555').text('ПРИЗНАЧЕННЯ ПЛАТЕЖУ', ML + 10, cy, { lineBreak: false });
    cy += 10;
    doc.font('R').fontSize(8.5).fillColor('#111111').text(purpose, ML + 10, cy, { width: textW, lineBreak: true });

    if (qr) {
      const qx = ML + CW - qrSide - 8;
      const qy = y + 6;
      vline(qx - 6, y, y + sampContentH, '#BBBBBB', 0.4);
      fillRect(qx, qy, qrSide, qrSide, '#ffffff');
      doc.save().fillColor('#000000');
      for (let r = 0; r < qr.size; r++) {
        for (let c = 0; c < qr.size; c++) {
          if (qr.dark[r][c]) doc.rect(qx + (c + QUIET) * MOD, qy + (r + QUIET) * MOD, MOD, MOD);
        }
      }
      doc.fill().restore();
      // Знак ₴ у білому колі по центру (обов'язково для формату 002)
      const cx = qx + qrSide / 2;
      const cyy = qy + qrSide / 2;
      doc.save().circle(cx, cyy, (qr.circle * MOD) / 2).fillColor('#ffffff').fill().restore();
      const glyphSize = (qr.circle - 4) * MOD * 1.05;
      doc.font('B').fontSize(glyphSize).fillColor('#000000');
      const gw = doc.widthOfString('₴');
      const gh = doc.currentLineHeight();
      doc.text('₴', cx - gw / 2, cyy - gh / 2 - glyphSize * 0.02, { lineBreak: false });
      doc.font('R').fontSize(6.5).fillColor('#555555').text(
        'Скануйте камерою в застосунку банку', qx - 4, qy + qrSide + 4, { width: qrSide + 8, align: 'center', lineBreak: true },
      );
    }

    y += sampContentH + 12;

    // ── 3. Title ────────────────────────────────────────────────────────────

    doc.font('B').fontSize(13).fillColor('#111111')
       .text(`Рахунок на оплату № ${order.order_number} від ${date}`, ML, y, { width: CW, lineBreak: false });
    y += 18;
    hline(ML, y, ML + CW, '#111111', 1.2);
    y += 8;

    // ── 4. Parties ──────────────────────────────────────────────────────────

    const LABEL_W = 96;
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
        ry += lh + 1;
      }
      return ry - yy + 2;
    }

    const supplierLines = [
      { text: bankRecipient, bold: true },
      ...(bankEdrpou  ? [{ text: `${taxIdLabel(bankEdrpou)}: ${bankEdrpou}`, color: '#444444' }] : []),
      ...(bankAddress ? [{ text: `Адреса: ${bankAddress}`,                  color: '#444444' }] : []),
      ...(bankName    ? [{ text: `Банк: ${bankName}`,                       color: '#444444' }] : []),
      ...(bankIban    ? [{ text: `IBAN: ${ibanDisplay}`,                    color: '#444444' }] : []),
      { text: sellerTaxStatus(docDate), color: '#444444' },
    ];
    y += drawParty('Постачальник:', supplierLines, y) + 2;
    hline(ML, y, ML + CW, '#cccccc', 0.4);
    y += 5;

    const buyerLines = [
      { text: b.name, bold: true },
      ...(b.edrpou ? [{ text: `${taxIdLabel(b.edrpou)}: ${b.edrpou}`, color: '#444444' }] : []),
      ...(b.address ? [{ text: `Адреса: ${b.address}`, color: '#444444' }] : []),
      ...(b.contactPerson ? [{ text: b.contactPerson, color: '#444444' }] : []),
      ...(b.phone ? [{ text: `Тел.: ${b.phone}`, color: '#444444' }] : []),
    ];
    y += drawParty('Покупець:', buyerLines, y) + 2;

    const showDue = showTerms && !!dueDateStr;
    const showDel = showDelivery && !!deliveryAddr;
    if (showDue || showDel) { hline(ML, y, ML + CW, '#cccccc', 0.4); y += 5; }
    if (showDue) y += drawParty('Строк оплати:', [{ text: `до ${dueDateStr}`, bold: true }], y);
    if (showDel) y += drawParty('Адреса доставки:', [{ text: deliveryAddr }], y);
    y += 6;

    // ── 5. Items table ──────────────────────────────────────────────────────
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
    const HDR = 20;

    function drawHeader() {
      fillRect(ML, y, CW, HDR, '#F2F2F2');
      strokeRect(ML, y, CW, HDR, BORDER);
      for (const col of C) {
        vline(col.x, y, y + HDR, BORDER);
        doc.font('B').fontSize(8).fillColor('#111111').text(
          col.label, col.x + 2, y + (HDR - 9) / 2, { width: col.w - 4, align: 'center', lineBreak: false },
        );
      }
      y += HDR;
    }

    ensureSpace(HDR + 17);
    drawHeader();
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const nameText = [item.brand, item.name].filter(Boolean).join(' ');
      const nameH = mh(nameText, C[2].w - 8, 8.5);
      const ROW = Math.max(nameH + 7, 17);

      // Рядок не влазить — нова сторінка з повтором шапки.
      if (y + ROW > BOTTOM) { doc.addPage(); y = TOP; drawHeader(); }

      strokeRect(ML, y, CW, ROW, BORDER);
      for (const col of C) vline(col.x, y, y + ROW, BORDER);

      const qty = Number(item.qty);
      const price = Number(item.price);
      const midY = y + (ROW - 9) / 2;
      doc.font('R').fontSize(8.5).fillColor('#111111');
      doc.text(String(idx + 1),            C[0].x+2, midY, { width: C[0].w-4, align: 'center', lineBreak: false });
      doc.fontSize(8).text(item.sku,        C[1].x+3, midY, { width: C[1].w-6, align: 'center', lineBreak: false });
      doc.fontSize(8.5).text(nameText,      C[2].x+4, y+4,  { width: C[2].w-8, lineBreak: true });
      doc.text(formatQty(qty),              C[3].x+2, midY, { width: C[3].w-6, align: 'right',  lineBreak: false });
      doc.text('шт.',                       C[4].x+2, midY, { width: C[4].w-4, align: 'center', lineBreak: false });
      doc.text(formatMoney(price),          C[5].x+2, midY, { width: C[5].w-6, align: 'right',  lineBreak: false });
      doc.text(formatMoney(qty * price),    C[6].x+2, midY, { width: C[6].w-6, align: 'right',  lineBreak: false });
      y += ROW;
    }

    // ── 6. Totals + sum in words ────────────────────────────────────────────

    const words = `${hryvniaInWords(total)}, без ПДВ`;
    const wordsH = mh(words, CW, 9, 'B');
    ensureSpace(18 + 14 + wordsH + 8);
    y += 4;
    doc.font('B').fontSize(9).fillColor('#111111')
       .text('Разом без ПДВ:', ML, y, { width: C[6].x - ML - 8, align: 'right', lineBreak: false })
       .text(formatMoney(total), C[6].x + 2, y, { width: C[6].w - 6, align: 'right', lineBreak: false });
    y += 18;
    doc.font('R').fontSize(8.5).fillColor('#111111')
       .text(`Всього найменувань: ${items.length}, на суму ${formatMoney(total)} грн`, ML, y, { width: CW, lineBreak: false });
    y += 14;
    doc.font('B').fontSize(9).fillColor('#111111').text(words, ML, y, { width: CW, lineBreak: true });
    y += wordsH + 8;
    // Призначення платежу — лише у зразку платіжки зверху (окрема рамка тут дублювала його).
    if (partlyPaid) {
      doc.font('R').fontSize(8.5).fillColor('#111111')
         .text(`Сплачено: ${formatMoney(total - amountDue)} грн. Залишок до сплати: ${formatMoney(amountDue)} грн.`, ML, y, { width: CW, lineBreak: false });
      y += 14;
    }
    y += 22;

    // ── 7. Signature ────────────────────────────────────────────────────────
    // Як у видатковій: посада, вільна лінія під підпис, ПІБ праворуч від неї.
    ensureSpace(40);

    const SIG_W = 260;
    const sx = ML + CW - SIG_W;
    const position = signer?.position?.trim();
    const name = signer?.name ? shortFio(signer.name) : '';
    doc.font('B').fontSize(9).fillColor('#111111').text('Виписав(ла):', sx, y, { lineBreak: false });
    if (position) doc.font('R').fontSize(9).text(position, sx + 70, y, { lineBreak: false });
    y += 16;
    doc.font('R').fontSize(9);
    const nameW = name ? doc.widthOfString(name) : 100;
    const lineX2 = sx + SIG_W - nameW - 10;
    hline(sx, y + 12, lineX2, BORDER, 0.7);
    doc.font('R').fontSize(7).fillColor('#9CA3AF').text('(підпис)', sx, y + 14, { width: lineX2 - sx, align: 'center', lineBreak: false });
    if (name) {
      doc.font('R').fontSize(9).fillColor('#111111').text(name, lineX2 + 10, y + 2, { lineBreak: false });
    } else {
      hline(lineX2 + 10, y + 12, sx + SIG_W, BORDER, 0.7);
      doc.font('R').fontSize(7).fillColor('#9CA3AF').text('(прізвище, ініціали)', lineX2 + 10, y + 14, { width: nameW, align: 'center', lineBreak: false });
    }

    // Номери сторінок — лише коли рахунок не вмістився на одну.
    const range = doc.bufferedPageRange();
    if (range.count > 1) {
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.font('R').fontSize(7.5).fillColor('#777777').text(
          `Рахунок на оплату № ${order.order_number} · сторінка ${i + 1} з ${range.count}`,
          ML, 842 - 22, { width: CW, align: 'right', lineBreak: false },
        );
      }
    }

    doc.end();
  });
}
