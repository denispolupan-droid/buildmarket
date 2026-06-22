import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Item = { sku: string; name: string; brand?: string | null; qty: number; price: number };

function formatIban(raw: string) {
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

// UUID is the auth — anyone with the link can download
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: order, error } = await db.from('orders').select('*').eq('id', id).single();
  if (error || !order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const bankRecipient = process.env.BANK_RECIPIENT ?? '';
  const bankIban      = process.env.BANK_IBAN      ?? '';
  const bankName      = process.env.BANK_NAME      ?? '';
  const bankEdrpou    = process.env.BANK_EDRPOU    ?? '';
  const bankAddress   = process.env.BANK_ADDRESS   ?? '';
  const signatoryName = process.env.SIGNATORY_NAME ?? '';
  const ibanDisplay   = formatIban(bankIban);

  const date      = new Date(order.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
  const dateShort = new Date(order.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const buyerName = order.company || order.contact;
  const total     = Number(order.total_price);
  const items     = (order.items ?? []) as Item[];
  const dueDateStr = order.payment_due_date
    ? new Date(order.payment_due_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;
  const deliveryAddr = [order.delivery_city_name, order.delivery_address].filter(Boolean).join(', ');

  // ── Build Excel ─────────────────────────────────────────────────────────────

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Buildmarket';
  wb.created = new Date();

  const ws = wb.addWorksheet('Рахунок');

  // Page: A4 portrait, fit to 1 page wide
  ws.pageSetup.paperSize        = 9;
  ws.pageSetup.orientation      = 'portrait';
  ws.pageSetup.fitToPage        = true;
  ws.pageSetup.fitToWidth       = 1;
  ws.pageSetup.fitToHeight      = 0;
  ws.pageSetup.horizontalCentered = false;
  // Margins in inches (1 inch = 25.4mm)
  ws.pageSetup.margins = { left: 0.55, right: 0.55, top: 0.4, bottom: 0.4, header: 0.1, footer: 0.1 };

  // Columns: A=№, B=Код, C=Найменування, D=Кількість, E=Од., F=Ціна, G=Сума
  ws.columns = [
    { width: 5   },
    { width: 13  },
    { width: 46  },
    { width: 12  },
    { width: 7   },
    { width: 13  },
    { width: 13  },
  ];

  // ── Color palette (ARGB) ────────────────────────────────────────────────────
  const C = {
    navy:      'FF1E3A5F',
    navyLight: 'FF4B6B8F',
    white:     'FFFFFFFF',
    stripe:    'FFF8FAFC',
    lightBlue: 'FFF4F8FD',
    headerBlue:'FFDCE8F5',
    gray:      'FFFAFBFC',
    grayBorder:'FFCBD5E1',
    cellBorder:'FFCCCCCC',
    textGray:  'FF555555',
    textBlue:  'FF3D5A80',
    amber:     'FFB45309',
    green:     'FF15803D',
  };

  const solidFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  const thinBorder = (argb = C.cellBorder): Partial<ExcelJS.Borders> => ({
    top:    { style: 'thin', color: { argb } },
    left:   { style: 'thin', color: { argb } },
    bottom: { style: 'thin', color: { argb } },
    right:  { style: 'thin', color: { argb } },
  });

  const font = (opts: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> => ({
    name: 'Calibri', size: 10, ...opts,
  });

  // Helper: set all 7 cells in a row with common style then override per cell
  function styleRow(
    rowNum: number,
    cells: Array<{
      col: number; value?: string | number; bold?: boolean; size?: number;
      color?: string; fill?: string; align?: ExcelJS.Alignment['horizontal'];
      border?: Partial<ExcelJS.Borders>; numFmt?: string; italic?: boolean;
      wrapText?: boolean;
    }>,
  ) {
    for (const c of cells) {
      const cell = ws.getCell(rowNum, c.col);
      if (c.value !== undefined) cell.value = c.value;
      cell.font = font({ bold: c.bold, color: { argb: c.color ?? C.navy.replace('FF','FF') }, size: c.size ?? 10, italic: c.italic });
      if (c.fill) cell.fill = solidFill(c.fill);
      cell.alignment = { horizontal: c.align ?? 'left', vertical: 'middle', wrapText: c.wrapText ?? false };
      if (c.border) cell.border = c.border;
      if (c.numFmt) cell.numFmt = c.numFmt;
    }
  }

  let r = 0; // current row index (1-based when used with ws.getRow/getCell)

  // ── 1. Warning notice ──────────────────────────────────────────────────────
  r++;
  const warnText = "Увага! Сплата даного рахунку означає згоду з умовами постачання товару. Повідомлення про сплату обов'язкове, інакше не гарантується наявність товару на складі.";
  ws.mergeCells(r, 1, r, 7);
  const warnCell = ws.getCell(r, 1);
  warnCell.value = warnText;
  warnCell.fill  = solidFill(C.gray);
  warnCell.font  = font({ size: 9, color: { argb: 'FF4A5568' } });
  warnCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  warnCell.border = thinBorder(C.grayBorder);
  ws.getRow(r).height = 30;

  // ── 2. Payment sample ──────────────────────────────────────────────────────
  r++;
  ws.mergeCells(r, 1, r, 7);
  const sampHdrCell = ws.getCell(r, 1);
  sampHdrCell.value = 'ЗРАЗОК ЗАПОВНЕННЯ ПЛАТІЖНОГО ДОРУЧЕННЯ';
  sampHdrCell.fill  = solidFill(C.headerBlue);
  sampHdrCell.font  = font({ bold: true, size: 9, color: { argb: C.textBlue } });
  sampHdrCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sampHdrCell.border = thinBorder(C.grayBorder);
  ws.getRow(r).height = 16;

  // Receiver + EDRPOU (on one row, two cells merged separately)
  r++;
  ws.mergeCells(r, 1, r, 4);
  ws.mergeCells(r, 5, r, 7);
  const recvCell = ws.getCell(r, 1);
  recvCell.value = `Одержувач: ${bankRecipient}`;
  recvCell.fill  = solidFill(C.lightBlue);
  recvCell.font  = font({ bold: true, size: 10 });
  recvCell.alignment = { horizontal: 'left', vertical: 'middle' };
  recvCell.border = thinBorder(C.grayBorder);
  const edrpouCell = ws.getCell(r, 5);
  edrpouCell.value = bankEdrpou ? `ЄДРПОУ/ДРФО: ${bankEdrpou}` : '';
  edrpouCell.fill  = solidFill(C.lightBlue);
  edrpouCell.font  = font({ bold: true, size: 10 });
  edrpouCell.alignment = { horizontal: 'left', vertical: 'middle' };
  edrpouCell.border = thinBorder(C.grayBorder);
  ws.getRow(r).height = 16;

  r++;
  ws.mergeCells(r, 1, r, 7);
  const bankCell = ws.getCell(r, 1);
  bankCell.value = `Банк: ${bankName}`;
  bankCell.fill  = solidFill(C.lightBlue);
  bankCell.font  = font({ size: 10 });
  bankCell.alignment = { horizontal: 'left', vertical: 'middle' };
  bankCell.border = thinBorder(C.grayBorder);
  ws.getRow(r).height = 15;

  r++;
  ws.mergeCells(r, 1, r, 7);
  const ibanCell = ws.getCell(r, 1);
  ibanCell.value = `IBAN: ${ibanDisplay}`;
  ibanCell.fill  = solidFill(C.lightBlue);
  ibanCell.font  = font({ bold: true, size: 13, color: { argb: C.navy } });
  ibanCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ibanCell.border = thinBorder(C.grayBorder);
  ws.getRow(r).height = 18;

  // ── 3. Title ───────────────────────────────────────────────────────────────
  r++;
  ws.getRow(r).height = 6; // spacer

  r++;
  ws.mergeCells(r, 1, r, 7);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = `Рахунок на оплату № ${order.order_number} від ${date}`;
  titleCell.font  = font({ bold: true, size: 14, color: { argb: 'FF111111' } });
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(r).height = 22;

  // Navy underline row
  r++;
  ws.mergeCells(r, 1, r, 7);
  const underlineCell = ws.getCell(r, 1);
  underlineCell.fill = solidFill(C.navy);
  ws.getRow(r).height = 3;

  // ── 4. Parties ─────────────────────────────────────────────────────────────
  function infoRow(label: string, value: string, isIban = false) {
    r++;
    ws.mergeCells(r, 1, r, 2);
    ws.mergeCells(r, 3, r, 7);
    const lCell = ws.getCell(r, 1);
    lCell.value = label;
    lCell.font  = font({ bold: true, size: 10 });
    lCell.alignment = { horizontal: 'left', vertical: 'top' };

    const vCell = ws.getCell(r, 3);
    vCell.value = value;
    vCell.font  = isIban
      ? font({ bold: true, size: 11, color: { argb: C.navy } })
      : font({ size: 10 });
    vCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    ws.getRow(r).height = 15;
  }

  r++; // spacer
  ws.getRow(r).height = 4;

  infoRow('Постачальник:', bankRecipient);
  if (bankEdrpou)  infoRow('ЄДРПОУ/ДРФО:', bankEdrpou);
  if (bankAddress) infoRow('Адреса:', bankAddress);
  if (bankName)    infoRow('Банк:', bankName);
  if (bankIban)    infoRow('IBAN:', ibanDisplay, true);

  r++; // dashed separator
  ws.mergeCells(r, 1, r, 7);
  ws.getRow(r).height = 4;

  infoRow('Покупець:', buyerName);
  if (order.company && order.contact !== order.company) infoRow('', order.contact);
  if (order.phone)   infoRow('Тел.:', order.phone);
  if (dueDateStr) {
    r++;
    ws.mergeCells(r, 1, r, 2);
    ws.mergeCells(r, 3, r, 7);
    const lc = ws.getCell(r, 1); lc.value = 'Строк оплати:'; lc.font = font({ bold: true, size: 10 }); lc.alignment = { horizontal: 'left', vertical: 'top' };
    const vc = ws.getCell(r, 3); vc.value = `до ${dueDateStr}`; vc.font = font({ bold: true, size: 10, color: { argb: C.amber } }); vc.alignment = { horizontal: 'left', vertical: 'top' };
    ws.getRow(r).height = 15;
  }
  if (deliveryAddr) infoRow('Адреса доставки:', deliveryAddr);

  r++; // spacer before table
  ws.getRow(r).height = 6;

  // ── 5. Items table ─────────────────────────────────────────────────────────
  const tableHdrRow = r + 1;
  r++;
  ws.getRow(r).height = 20;

  // Table header
  const hdrLabels = ['№', 'Код', 'Найменування товару', 'Кількість', 'Од.', 'Ціна, грн', 'Сума, грн'];
  const hdrAlign: ExcelJS.Alignment['horizontal'][] = ['center', 'center', 'left', 'center', 'center', 'right', 'right'];
  for (let col = 1; col <= 7; col++) {
    const cell = ws.getCell(r, col);
    cell.value = hdrLabels[col - 1];
    cell.fill  = solidFill(C.navy);
    cell.font  = font({ bold: true, size: 10, color: { argb: C.white } });
    cell.alignment = { horizontal: hdrAlign[col - 1], vertical: 'middle' };
    cell.border = { top: { style: 'thin', color: { argb: C.navyLight } }, left: { style: 'thin', color: { argb: C.navyLight } }, bottom: { style: 'thin', color: { argb: C.navyLight } }, right: { style: 'thin', color: { argb: C.navyLight } } };
  }

  // Data rows
  const PRICE_FMT = '#,##0.00';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = [item.brand, item.name].filter(Boolean).join(' ');
    const sum  = item.qty * Number(item.price);
    const bg   = i % 2 === 1 ? C.stripe : C.white;
    r++;
    ws.getRow(r).height = 16;

    const rowData: [number, (string | number), string, number, string, number, number] =
      [i + 1, item.sku, name, item.qty, 'шт', Number(item.price), sum];
    const rowAligns: ExcelJS.Alignment['horizontal'][] = ['center', 'center', 'left', 'right', 'center', 'right', 'right'];

    for (let col = 1; col <= 7; col++) {
      const cell = ws.getCell(r, col);
      cell.value = rowData[col - 1];
      cell.fill  = solidFill(bg);
      cell.font  = font({ bold: col === 7, size: 10 });
      cell.alignment = { horizontal: rowAligns[col - 1], vertical: 'middle', wrapText: col === 3 };
      cell.border = thinBorder();
      if (col === 6 || col === 7) cell.numFmt = PRICE_FMT;
    }
  }

  // Total row
  r++;
  ws.getRow(r).height = 16;
  ws.mergeCells(r, 1, r, 6);
  const totLabelCell = ws.getCell(r, 1);
  totLabelCell.value = 'Всього без ПДВ:';
  totLabelCell.font  = font({ size: 10, color: { argb: C.textGray } });
  totLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };
  totLabelCell.border = thinBorder();
  const totValCell = ws.getCell(r, 7);
  totValCell.value  = total;
  totValCell.font   = font({ bold: true, size: 10 });
  totValCell.alignment = { horizontal: 'right', vertical: 'middle' };
  totValCell.border = thinBorder();
  totValCell.numFmt = PRICE_FMT;

  // ── 6. Sum in words ────────────────────────────────────────────────────────
  r++;
  ws.getRow(r).height = 4; // spacer

  r++;
  ws.mergeCells(r, 1, r, 7);
  const sumLine = ws.getCell(r, 1);
  sumLine.value = `Всього найменувань: ${items.length}, на суму ${total.toFixed(2)} грн`;
  sumLine.font  = font({ size: 10 });
  sumLine.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(r).height = 14;

  r++;
  ws.mergeCells(r, 1, r, 7);
  const wordsCell = ws.getCell(r, 1);
  wordsCell.value = numToWords(total);
  wordsCell.font  = font({ size: 10, italic: true, color: { argb: 'FF555555' } });
  wordsCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(r).height = 14;

  // ── 7. Payment purpose ─────────────────────────────────────────────────────
  r++;
  ws.getRow(r).height = 4; // spacer

  r++;
  ws.mergeCells(r, 1, r, 7);
  const purposeCell = ws.getCell(r, 1);
  purposeCell.value = `Призначення платежу: Оплата за замовлення №${order.order_number} від ${dateShort}. Без ПДВ.`;
  purposeCell.font  = font({ size: 10 });
  purposeCell.fill  = solidFill('FFF9FAFB');
  purposeCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  purposeCell.border = thinBorder('FFD1D5DB');
  ws.getRow(r).height = 16;

  // ── 8. Signature ───────────────────────────────────────────────────────────
  r++;
  ws.getRow(r).height = 6;

  r++;
  ws.mergeCells(r, 1, r, 4);
  ws.mergeCells(r, 5, r, 7);
  ws.getCell(r, 1).value = '';
  const sigCell = ws.getCell(r, 5);
  sigCell.value = signatoryName
    ? `Виписав(ла): ${signatoryName}`
    : 'Виписав(ла): _______________________';
  sigCell.font = font({ size: 10 });
  sigCell.alignment = { horizontal: 'right', vertical: 'bottom' };
  ws.getRow(r).height = 20;

  // ── Print settings ─────────────────────────────────────────────────────────
  // Repeat table header on each page
  ws.pageSetup.printTitlesRow = `${tableHdrRow}:${tableHdrRow}`;

  // Print area
  ws.pageSetup.printArea = `A1:G${r}`;

  // ── Generate buffer ─────────────────────────────────────────────────────────
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''%D0%A0%D0%B0%D1%85%D1%83%D0%BD%D0%BE%D0%BA_${order.order_number}.xlsx`,
    },
  });
}
