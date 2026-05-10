import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function GET() {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Артикул (SKU)',
    'Кількість',
    'Ваша ціна (COD, грн)',
    'Прізвище',
    "Ім'я",
    'По батькові',
    'Телефон',
    'Місто (НП)',
    'Відділення №',
  ];

  const example = [
    '1548-056', 2, 850, 'Іваненко', 'Іван', 'Іванович',
    '0991234567', 'Харків', '15',
  ];

  const example2 = [
    '2100-002', 1, 1500, 'Петренко', 'Олена', 'Миколаївна',
    '0671234567', 'Київ', '301',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, example, example2]);

  // Ширина колонок
  ws['!cols'] = [
    { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 12 },
    { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Замовлення');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="fixline-dropship-template.xlsx"',
    },
  });
}
