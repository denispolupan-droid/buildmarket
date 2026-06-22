import PDFDocument from 'pdfkit';
import path from 'path';

type PrintLine = { sku: string; name: string; qty: number; price: number };

const FONT_R = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf');
const FONT_B = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans-Bold.ttf');

function formatIban(raw: string): string {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

function numToWords(n: number): string {
  const ones = ['', 'одна', 'дві', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять",
    'десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', "п'ятнадцять",
    'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев'ятнадцять"];
  const tens = ['', '', 'двадцять', 'тридцять', 'сорок', "п'ятдесят", 'шістдесят', 'сімдесят', 'вісімдесят', "дев'яносто"];
  const hundreds = ['', 'сто', 'двісті', 'триста', 'чотириста', "п'ятсот", 'шістсот', 'сімсот', 'вісімсот', "дев'ятсот"];
  function chunk(x: number): string {
    if (x === 0) return '';
    const parts: string[] = [];
    if (Math.floor(x / 100) > 0) parts.push(hundreds[Math.floor(x / 100)]);
    const rem = x % 100;
    if (rem >= 20) { parts.push(tens[Math.floor(rem / 10)]); if (rem % 10 > 0) parts.push(ones[rem % 10]); }
    else if (rem > 0) parts.push(ones[rem]);
    return parts.join(' ');
  }
  const intPart = Math.floor(n);
  const kopPart = Math.round((n - intPart) * 100);
  const millions = Math.floor(intPart / 1_000_000);
  const thous    = Math.floor((intPart % 1_000_000) / 1_000);
  const rem      = intPart % 1_000;
  function declThousands(x: number) {
    if (x % 100 >= 11 && x % 100 <= 19) return 'тисяч';
    if (x % 10 === 1) return 'тисяча';
    if (x % 10 >= 2 && x % 10 <= 4) return 'тисячі';
    return 'тисяч';
  }
  const parts: string[] = [];
  if (millions > 0) parts.push(chunk(millions) + ' мільйонів');
  if (thous > 0)    parts.push(chunk(thous) + ' ' + declThousands(thous));
  if (rem > 0 || intPart === 0) parts.push(chunk(rem || 0));
  const gryvn = parts.join(' ').trim();
  const r = intPart % 100;
  const gryvDecl = (r >= 11 && r <= 19) ? 'гривень'
    : (intPart % 10 === 1) ? 'гривня'
    : (intPart % 10 >= 2 && intPart % 10 <= 4) ? 'гривні'
    : 'гривень';
  const first = gryvn.charAt(0).toUpperCase() + gryvn.slice(1);
  return `${first} ${gryvDecl} ${String(kopPart).padStart(2, '0')} копійок`;
}

export async function buildVidatkovaPdf(params: {
  docNumber: string;
  docDate: string;
  lines: PrintLine[];
  total: number;
  sellerName: string;
  sellerEdrpou: string;
  sellerAddress: string;
  sellerBank: string;
  sellerIban: string;
  buyerName: string;
  buyerPhone?: string | null;
  buyerEdrpou?: string | null;
  orderNumber?: number | null;
  signatoryName?: string;
}): Promise<Buffer> {
  const {
    docNumber, docDate, lines, total,
    sellerName, sellerEdrpou, sellerAddress, sellerBank, sellerIban,
    buyerName, buyerPhone, buyerEdrpou, orderNumber, signatoryName = '',
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
    if (orderNumber) {
      doc.font('R').fontSize(9).fillColor('#555555').text(`Підстава: замовлення №${orderNumber}`, ML, y, { lineBreak: false });
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
      ...(buyerPhone  ? [{ text: `Тел.: ${buyerPhone}`,           color: '#555555' }] : []),
    ];
    y += drawParty('Покупець:', buyerRows, y) + 6;

    // ── 3. Items table ──────────────────────────────────────────────────────
    // Cols: 22+68+233+52+28+68+68 = 539 = CW
    const C = [
      { x: ML,      w: 22,  label: '№',               al: 'center' as const },
      { x: ML+22,   w: 68,  label: 'Код',              al: 'center' as const },
      { x: ML+90,   w: 233, label: 'Найменування',     al: 'left'   as const },
      { x: ML+323,  w: 52,  label: 'Кількість',        al: 'center' as const },
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
    doc.font('R').fontSize(8.5).fillColor('#555').text(numToWords(total), ML, y, { width: CW, lineBreak: false });
    y += 20;

    // ── 5. Signature table ──────────────────────────────────────────────────
    // Two rows: Відпустив / Отримав, 4 cols: label | посада | підпис | ПІБ
    const sigRows = ['Відпустив:', 'Отримав:'];
    const sigCols = [
      { x: ML,       w: 76  },
      { x: ML+76,    w: 140, label: '(посада)' },
      { x: ML+216,   w: 100, label: '(підпис)' },
      { x: ML+316,   w: CW-316, label: "(прізвище, ім'я)" },
    ];
    const SIG_ROW_H = 22;
    for (let ri = 0; ri < sigRows.length; ri++) {
      const ry = y + ri * SIG_ROW_H;
      fillRect(ML, ry, CW, SIG_ROW_H, '#ffffff');
      strokeRect(ML, ry, CW, SIG_ROW_H, '#cccccc', 0.3);
      for (const col of sigCols) {
        vline(col.x, ry, ry + SIG_ROW_H, '#cccccc', 0.3);
        if (col.label) {
          const isSignatoryCell = ri === 0 && col === sigCols[1] && signatoryName;
          doc.font('R').fontSize(7.5)
             .fillColor(isSignatoryCell ? '#111111' : '#9CA3AF')
             .text(isSignatoryCell ? signatoryName : col.label, col.x + 4, ry + 7, { width: col.w - 8, align: 'center', lineBreak: false });
        }
      }
      doc.font('B').fontSize(8.5).fillColor('#111111').text(sigRows[ri], ML + 4, ry + 7, { width: sigCols[0].w - 8, lineBreak: false });
    }
    y += sigRows.length * SIG_ROW_H + 6;

    // M.P. labels
    doc.font('R').fontSize(7.5).fillColor('#9CA3AF').text('М.П.', ML + 4, y, { lineBreak: false });
    doc.font('R').fontSize(7.5).fillColor('#9CA3AF').text('М.П.', ML + 316, y, { lineBreak: false });

    doc.end();
  });
}
