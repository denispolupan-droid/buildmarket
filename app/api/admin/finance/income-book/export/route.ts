import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { kyivMonthStart, kyivYmd } from '../../../../../../lib/kyiv-date';
import { buildIncomeBook, INCOME_METHODS, METHOD_LABEL, SOURCE_LABEL, type IncomeRow } from '../../../../../../lib/accounting/income-book';

/** XLSX «Книги обліку доходів» за період — для бухгалтера (дані — fop_income_book, міграція 142). */
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const from = sp.get('from') ?? kyivMonthStart(now);
  const to   = sp.get('to')   ?? kyivYmd(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Дати у форматі YYYY-MM-DD' }, { status: 400 });
  }

  const { data, error } = await createServiceClient().rpc('fop_income_book', { p_from: from, p_to: to });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const book = buildIncomeBook((data ?? []) as IncomeRow[]);

  const daily: Record<string, string | number>[] = [];
  for (const mo of book.months) {
    for (const d of mo.days) {
      const row: Record<string, string | number> = { 'Дата': `${d.day.slice(8, 10)}.${d.day.slice(5, 7)}.${d.day.slice(0, 4)}` };
      for (const m of INCOME_METHODS) row[METHOD_LABEL[m]] = d.byMethod[m];
      row['Разом'] = d.total;
      row['Операцій'] = d.txns;
      daily.push(row);
    }
    daily.push({ 'Дата': `Разом за ${mo.month}`, 'Разом': mo.total });
  }
  const totalRow: Record<string, string | number> = { 'Дата': 'РАЗОМ за період' };
  for (const m of INCOME_METHODS) totalRow[METHOD_LABEL[m]] = book.byMethod[m];
  totalRow['Разом'] = book.total;
  totalRow['Операцій'] = book.txns;
  daily.push(totalRow);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(daily);
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'По днях');
  const src = XLSX.utils.json_to_sheet(
    Object.entries(book.bySource).map(([k, v]) => ({ 'Джерело': SOURCE_LABEL[k] ?? k, 'Сума, грн': v })),
  );
  src['!cols'] = [{ wch: 28 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, src, 'Склад');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="income-book_${from}_${to}.xlsx"`,
    },
  });
}
