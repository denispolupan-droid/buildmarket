// PDF друкованих форм повернення — той самий 1С-стиль, що й видаткова
// (lib/vidatkova-pdf.ts): Liberation Sans, тонкі чорні рамки, сіра шапка.
//   «Накладна на повернення товару» — ПВ (покупець → ми) і ПП (ми → постачальник)
//   «Акт повернення товару»         — ПВ: з причиною, станом товару й грошима

import PDFDocument from 'pdfkit';
import path from 'path';
import { hryvniaInWords } from './number-to-words';
import { shortFio, type Signer } from './signatory';
import { formatMoney, formatQty, formatDocDate, taxIdLabel } from './doc-format';
import type { ReturnParty, ReturnPrintParams } from './return-doc';

const FONT_R = path.join(process.cwd(), 'public', 'fonts', 'LiberationSans-Regular.ttf');
const FONT_B = path.join(process.cwd(), 'public', 'fonts', 'LiberationSans-Bold.ttf');

function formatIban(raw: string): string {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

export async function buildReturnPdf(p: ReturnPrintParams): Promise<Buffer> {
  const date = formatDocDate(p.docDate);
  const isAkt = p.form === 'akt';
  const title = isAkt
    ? `Акт повернення товару № ${p.docNumber} від ${date}`
    : `Накладна на повернення товару № ${p.docNumber} від ${date}`;
  const subtitleKind = p.kind === 'customer' ? 'Повернення від покупця' : 'Повернення постачальнику';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('R', FONT_R);
    doc.registerFont('B', FONT_B);

    const ML = 28, CW = 595 - ML - 28, TOP = 26, BOTTOM = 842 - 34;
    let y = TOP;

    const fillRect = (x: number, yy: number, w: number, h: number, color: string) =>
      doc.save().rect(x, yy, w, h).fillColor(color).fill().restore();
    const strokeRect = (x: number, yy: number, w: number, h: number, color: string, lw = 0.4) =>
      doc.save().rect(x, yy, w, h).lineWidth(lw).strokeColor(color).stroke().restore();
    const hline = (x1: number, y1: number, x2: number, color: string, lw = 0.4) =>
      doc.save().moveTo(x1, y1).lineTo(x2, y1).lineWidth(lw).strokeColor(color).stroke().restore();
    const vline = (x1: number, y1: number, y2: number, color: string, lw = 0.4) =>
      doc.save().moveTo(x1, y1).lineTo(x1, y2).lineWidth(lw).strokeColor(color).stroke().restore();
    const mh = (text: string, width: number, size: number, font: 'R' | 'B' = 'R') =>
      doc.font(font).fontSize(size).heightOfString(text, { width });
    const ensureSpace = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = TOP; } };

    // ── Заголовок ──────────────────────────────────────────────────────────
    doc.font('B').fontSize(13).fillColor('#111111').text(title, ML, y, { width: CW, lineBreak: false });
    y += 18;
    const subtitle = [
      subtitleKind,
      p.city ? `Місце складання: ${p.city}` : null,
      p.basis ? `Підстава: ${p.basis}` : null,
    ].filter(Boolean).join(' · ');
    const subH = mh(subtitle, CW, 8.5);
    doc.font('R').fontSize(8.5).fillColor('#555555').text(subtitle, ML, y, { width: CW });
    y += subH + 4;
    hline(ML, y, ML + CW, '#111111', 1.2);
    y += 8;

    // ── Сторони ────────────────────────────────────────────────────────────
    const LABEL_W = 90, VAL_X = ML + LABEL_W + 4, VAL_W = CW - LABEL_W - 4;
    function drawParty(party: ReturnParty, yy: number): number {
      doc.font('B').fontSize(9).fillColor('#111111').text(`${party.role}:`, ML, yy, { width: LABEL_W, lineBreak: false });
      const rows: Array<{ text: string; bold?: boolean; color?: string }> = [
        { text: party.name, bold: true },
        ...(party.edrpou    ? [{ text: `${taxIdLabel(party.edrpou)}: ${party.edrpou}`, color: '#444444' }] : []),
        ...(party.address   ? [{ text: `Адреса: ${party.address}`,                     color: '#444444' }] : []),
        ...(party.phone     ? [{ text: `Тел.: ${party.phone}`,                         color: '#444444' }] : []),
        ...(party.bank      ? [{ text: `Банк: ${party.bank}`,                          color: '#444444' }] : []),
        ...(party.iban      ? [{ text: `IBAN: ${formatIban(party.iban)}`,              color: '#444444' }] : []),
        ...(party.taxStatus ? [{ text: party.taxStatus,                                color: '#444444' }] : []),
      ];
      let ry = yy;
      for (const r of rows) {
        const font = r.bold ? 'B' : 'R', sz = r.bold ? 9 : 8.5;
        const lh = mh(r.text, VAL_W, sz, font);
        doc.font(font).fontSize(sz).fillColor(r.color ?? '#111111').text(r.text, VAL_X, ry, { width: VAL_W });
        ry += lh + 1;
      }
      return ry - yy + 2;
    }
    y += drawParty(p.sender, y) + 2;
    hline(ML, y, ML + CW, '#cccccc');
    y += 5;
    y += drawParty(p.receiver, y) + 6;

    // ── Акт: формулювання операції ─────────────────────────────────────────
    if (isAkt) {
      const intro = `${p.sender.role} повертає, а ${p.receiver.role.toLowerCase()} приймає товар у кількості та за цінами, наведеними нижче:`;
      const ih = mh(intro, CW, 9);
      doc.font('R').fontSize(9).fillColor('#111111').text(intro, ML, y, { width: CW });
      y += ih + 6;
    }

    // ── Таблиця ────────────────────────────────────────────────────────────
    const C = [
      { x: ML,     w: 22,  label: '№' },
      { x: ML+22,  w: 62,  label: 'Код' },
      { x: ML+84,  w: 235, label: 'Найменування товару' },
      { x: ML+319, w: 54,  label: 'Кількість' },
      { x: ML+373, w: 30,  label: 'Од.' },
      { x: ML+403, w: 64,  label: 'Ціна, грн' },
      { x: ML+467, w: 72,  label: 'Сума, грн' },
    ];
    const BORDER = '#000000', HDR = 20;
    function drawHeader() {
      fillRect(ML, y, CW, HDR, '#F2F2F2');
      strokeRect(ML, y, CW, HDR, BORDER, 0.5);
      for (const col of C) {
        vline(col.x, y, y + HDR, BORDER, 0.5);
        doc.font('B').fontSize(8).fillColor('#111111').text(col.label, col.x + 2, y + (HDR - 9) / 2, { width: col.w - 4, align: 'center', lineBreak: false });
      }
      y += HDR;
    }
    drawHeader();
    p.lines.forEach((item, idx) => {
      const nameH = mh(item.name, C[2].w - 8, 8.5);
      const ROW = Math.max(nameH + 7, 17);
      if (y + ROW > BOTTOM) { doc.addPage(); y = TOP; drawHeader(); }
      strokeRect(ML, y, CW, ROW, BORDER, 0.5);
      for (const col of C) vline(col.x, y, y + ROW, BORDER, 0.5);
      const midY = y + (ROW - 9) / 2;
      doc.font('R').fontSize(8.5).fillColor('#111111');
      doc.text(String(idx + 1),                   C[0].x+2, midY, { width: C[0].w-4, align: 'center', lineBreak: false });
      doc.fontSize(8).text(item.sku,               C[1].x+3, midY, { width: C[1].w-6, align: 'center', lineBreak: false });
      doc.fontSize(8.5).text(item.name,            C[2].x+4, y+4,  { width: C[2].w-8 });
      doc.text(formatQty(item.qty),                C[3].x+2, midY, { width: C[3].w-6, align: 'right',  lineBreak: false });
      doc.text(item.unit,                          C[4].x+2, midY, { width: C[4].w-4, align: 'center', lineBreak: false });
      doc.text(formatMoney(item.price),            C[5].x+2, midY, { width: C[5].w-6, align: 'right',  lineBreak: false });
      doc.text(formatMoney(item.qty * item.price), C[6].x+2, midY, { width: C[6].w-6, align: 'right',  lineBreak: false });
      y += ROW;
    });

    // ── Підсумок ───────────────────────────────────────────────────────────
    const words = `${hryvniaInWords(p.total)}, без ПДВ`;
    const wordsH = mh(words, CW, 9, 'B');
    ensureSpace(18 + 14 + wordsH + 10);
    y += 4;
    doc.font('B').fontSize(9).fillColor('#111111')
       .text('Разом без ПДВ:', ML, y, { width: C[6].x - ML - 8, align: 'right', lineBreak: false })
       .text(formatMoney(p.total), C[6].x + 2, y, { width: C[6].w - 6, align: 'right', lineBreak: false });
    y += 18;
    doc.font('R').fontSize(8.5).fillColor('#111111')
       .text(`Всього найменувань: ${p.lines.length}, на суму ${formatMoney(p.total)} грн`, ML, y, { width: CW, lineBreak: false });
    y += 14;
    doc.font('B').fontSize(9).fillColor('#111111').text(words, ML, y, { width: CW });
    y += wordsH + 8;

    // ── Причина, ТТН, гроші ────────────────────────────────────────────────
    const notes: string[] = [];
    if (p.reason) notes.push(`Причина повернення: ${p.reason}`);
    if (p.ttn) notes.push(`Відправлення (ТТН): ${p.ttn}`);
    if (isAkt) {
      notes.push('Товар прийнято в кількості та стані, зазначених вище; сторони претензій одна до одної не мають.');
      if (p.moneyNote) notes.push(p.moneyNote);
    }
    for (const n of notes) {
      const h = mh(n, CW, 8.5);
      ensureSpace(h + 4);
      doc.font('R').fontSize(8.5).fillColor('#111111').text(n, ML, y, { width: CW });
      y += h + 3;
    }

    // ── Підписи ────────────────────────────────────────────────────────────
    y += 8;
    ensureSpace(95);
    const SIG_W = 240, leftX = ML, rightX = ML + CW - SIG_W;
    function drawSignature(bx: number, label: string, signer: Signer | null | undefined) {
      const caption = (text: string, x: number, w: number, top: number) =>
        doc.font('R').fontSize(7).fillColor('#9CA3AF').text(text, x, top, { width: w, align: 'center', lineBreak: false });
      let by = y;
      doc.font('B').fontSize(9).fillColor('#111111').text(`${label}:`, bx, by, { lineBreak: false });
      by += 15;
      const position = signer?.position?.trim();
      if (position) {
        doc.font('R').fontSize(9).fillColor('#111111').text(position, bx, by, { width: SIG_W, lineBreak: false });
        by += 20;
      } else {
        hline(bx, by + 10, bx + SIG_W, '#000000', 0.7);
        caption('(посада)', bx, SIG_W, by + 12);
        by += 24;
      }
      const name = signer?.name ? shortFio(signer.name) : '';
      doc.font('R').fontSize(9);
      const nameW = name ? doc.widthOfString(name) : 100;
      const lineX2 = bx + SIG_W - nameW - 10;
      hline(bx, by + 12, lineX2, '#000000', 0.7);
      caption('(підпис)', bx, lineX2 - bx, by + 14);
      if (name) doc.font('R').fontSize(9).fillColor('#111111').text(name, lineX2 + 10, by + 2, { lineBreak: false });
      else { hline(lineX2 + 10, by + 12, bx + SIG_W, '#000000', 0.7); caption('(прізвище, ініціали)', lineX2 + 10, nameW, by + 14); }
      doc.font('R').fontSize(8.5).fillColor('#555555').text('М.П.', bx, by + 32, { lineBreak: false });
    }
    const leftLabel  = isAkt ? `Передав (${p.sender.role})`   : 'Відпустив(ла)';
    const rightLabel = isAkt ? `Прийняв (${p.receiver.role})` : 'Отримав(ла)';
    drawSignature(leftX,  leftLabel,  p.sender.signer);
    drawSignature(rightX, rightLabel, p.receiver.signer);

    const range = doc.bufferedPageRange();
    if (range.count > 1) {
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.font('R').fontSize(7.5).fillColor('#777777').text(
          `${isAkt ? 'Акт повернення' : 'Накладна на повернення'} № ${p.docNumber} · сторінка ${i + 1} з ${range.count}`,
          ML, 842 - 22, { width: CW, align: 'right', lineBreak: false },
        );
      }
    }
    doc.end();
  });
}
