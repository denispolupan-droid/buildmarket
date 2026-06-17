'use client';

import { Printer, FileSpreadsheet } from 'lucide-react';

type Item = { sku: string; name: string; brand: string; qty: number; price: number };

type SaleDoc = {
  doc_number: string;
  doc_date: string;
};

type OrderData = {
  order_number: number;
  contact: string;
  company: string | null;
  phone: string;
  email: string;
  delivery_address: string | null;
  items: Item[];
  total_price: number;
};

function numToWords(n: number): string {
  const ones = ['', 'одна', 'дві', 'три', 'чотири', 'п\'ять', 'шість', 'сім', 'вісім', 'дев\'ять',
    'десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', 'п\'ятнадцять',
    'шістнадцять', 'сімнадцять', 'вісімнадцять', 'дев\'ятнадцять'];
  const tens = ['', '', 'двадцять', 'тридцять', 'сорок', 'п\'ятдесят', 'шістдесят', 'сімдесят', 'вісімдесят', 'дев\'яносто'];
  const hundreds = ['', 'сто', 'двісті', 'триста', 'чотириста', 'п\'ятсот', 'шістсот', 'сімсот', 'вісімсот', 'дев\'ятсот'];
  const thousands = ['тисяча', 'тисячі', 'тисяч'];

  function declThousands(n: number) {
    if (n % 100 >= 11 && n % 100 <= 19) return thousands[2];
    if (n % 10 === 1) return thousands[0];
    if (n % 10 >= 2 && n % 10 <= 4) return thousands[1];
    return thousands[2];
  }

  function chunk(n: number): string {
    if (n === 0) return '';
    const parts: string[] = [];
    if (Math.floor(n / 100) > 0) parts.push(hundreds[Math.floor(n / 100)]);
    const rem = n % 100;
    if (rem >= 20) {
      parts.push(tens[Math.floor(rem / 10)]);
      if (rem % 10 > 0) parts.push(ones[rem % 10]);
    } else if (rem > 0) {
      parts.push(ones[rem]);
    }
    return parts.join(' ');
  }

  const intPart = Math.floor(n);
  const kopPart = Math.round((n - intPart) * 100);
  const parts: string[] = [];

  const millions = Math.floor(intPart / 1_000_000);
  const thous    = Math.floor((intPart % 1_000_000) / 1_000);
  const rem      = intPart % 1_000;

  if (millions > 0) {
    parts.push(chunk(millions) + ' мільйонів');
  }
  if (thous > 0) {
    parts.push(chunk(thous) + ' ' + declThousands(thous));
  }
  if (rem > 0 || intPart === 0) {
    parts.push(chunk(rem || 0));
  }

  const gryvn = parts.join(' ').trim();
  const gryvDecl = (() => {
    const r = intPart % 100;
    if (r >= 11 && r <= 19) return 'гривень';
    if (intPart % 10 === 1) return 'гривня';
    if (intPart % 10 >= 2 && intPart % 10 <= 4) return 'гривні';
    return 'гривень';
  })();

  return `${gryvn} ${gryvDecl} ${String(kopPart).padStart(2, '0')} копійок`;
}

export default function VydatkovaPrint({
  doc,
  order,
  sellerName,
  sellerEdrpou,
  sellerAddress,
  sellerPhone,
}: {
  doc: SaleDoc;
  order: OrderData;
  sellerName: string;
  sellerEdrpou: string;
  sellerAddress?: string;
  sellerPhone?: string;
}) {
  const docDate = new Date(doc.doc_date).toLocaleDateString('uk-UA', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const total = order.items.reduce((s, i) => s + i.qty * i.price, 0);
  const buyerName = order.company || order.contact;

  async function exportExcel() {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const rows: (string | number)[][] = [
      [`ВИДАТКОВА НАКЛАДНА ${doc.doc_number} від ${docDate}`],
      [],
      ['Постачальник:', sellerName, '', 'Покупець:', buyerName],
      ['ЄДРПОУ:', sellerEdrpou, '', 'Контакт:', order.contact],
      [],
      ['№', 'Найменування', 'Артикул', 'Од.', 'К-сть', 'Ціна, грн', 'Сума, грн'],
      ...order.items.map((i, idx) => [idx + 1, `${i.brand} ${i.name}`.trim(), i.sku, 'шт', i.qty, i.price, +(i.qty * i.price).toFixed(2)]),
      [],
      ['', '', '', '', '', 'РАЗОМ:', +total.toFixed(2)],
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws = XLSX.utils.aoa_to_sheet(rows as any);
    ws['!cols'] = [{ wch: 4 }, { wch: 44 }, { wch: 14 }, { wch: 5 }, { wch: 8 }, { wch: 13 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Видаткова');
    XLSX.writeFile(wb, `ВН_${doc.doc_number}.xlsx`);
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; font-family: Arial, sans-serif; }
          .doc-wrap { box-shadow: none !important; border: none !important; margin: 0 !important; }
        }
        @page { margin: 14mm 16mm; size: A4; }
        body { font-family: Arial, sans-serif; }
        table { border-collapse: collapse; width: 100%; }
        table th, table td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; }
        table th { background: #f5f5f5; font-weight: 700; text-align: center; }
      `}</style>

      <div className="no-print" style={{
        position: 'fixed', bottom: '32px', right: '80px', zIndex: 100,
        display: 'flex', gap: '10px',
      }}>
        <button onClick={exportExcel} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          height: '48px', padding: '0 20px', borderRadius: '12px',
          background: '#15803D', color: '#fff', fontSize: '14px', fontWeight: 700,
          border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(21,128,61,0.3)',
        }}>
          <FileSpreadsheet size={16} /> Excel
        </button>
        <button onClick={() => window.print()} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          height: '48px', padding: '0 24px', borderRadius: '12px',
          background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 700,
          border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(30,58,95,0.3)',
        }}>
          <Printer size={16} /> Друк
        </button>
      </div>

      <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: '32px 16px' }}>
        <div className="doc-wrap" style={{
          maxWidth: '780px', margin: '0 auto', background: '#fff',
          boxShadow: '0 2px 16px rgba(0,0,0,0.1)', padding: '28px 32px',
        }}>

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Видаткова накладна
            </div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>
              {doc.doc_number} від {docDate}
            </div>
          </div>

          {/* Parties */}
          <table style={{ marginBottom: '14px', fontSize: '12px' }}>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #000', padding: '8px 12px', width: '50%', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>Постачальник (Продавець):</div>
                  <div>{sellerName}</div>
                  {sellerEdrpou && <div>ЄДРПОУ: {sellerEdrpou}</div>}
                  {sellerAddress && <div>{sellerAddress}</div>}
                  {sellerPhone && <div>Тел.: {sellerPhone}</div>}
                </td>
                <td style={{ border: '1px solid #000', padding: '8px 12px', width: '50%', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>Покупець:</div>
                  <div>{buyerName}</div>
                  {order.company && <div>{order.contact}</div>}
                  {order.phone && <div>Тел.: {order.phone}</div>}
                  {order.email && <div>{order.email}</div>}
                  {order.delivery_address && <div>{order.delivery_address}</div>}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Items */}
          <table style={{ marginBottom: '10px' }}>
            <thead>
              <tr>
                <th style={{ width: '30px' }}>№</th>
                <th style={{ textAlign: 'left' }}>Найменування товарів</th>
                <th style={{ width: '100px' }}>Артикул</th>
                <th style={{ width: '40px' }}>Од.</th>
                <th style={{ width: '55px' }}>К-сть</th>
                <th style={{ width: '90px' }}>Ціна, грн</th>
                <th style={{ width: '90px' }}>Сума, грн</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, idx) => (
                <tr key={item.sku}>
                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ textAlign: 'left' }}>{item.brand} {item.name}</td>
                  <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '10px' }}>{item.sku}</td>
                  <td style={{ textAlign: 'center' }}>шт</td>
                  <td style={{ textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ textAlign: 'right' }}>{item.price.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{(item.qty * item.price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, border: '1px solid #000', padding: '5px 6px' }}>
                  Разом без ПДВ:
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, border: '1px solid #000', padding: '5px 6px' }}>
                  {total.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td colSpan={6} style={{ textAlign: 'right', border: '1px solid #000', padding: '5px 6px' }}>
                  ПДВ:
                </td>
                <td style={{ textAlign: 'right', border: '1px solid #000', padding: '5px 6px' }}>
                  Без ПДВ
                </td>
              </tr>
              <tr>
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, border: '1px solid #000', padding: '5px 6px' }}>
                  До сплати:
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, border: '1px solid #000', padding: '5px 6px' }}>
                  {total.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Sum in words */}
          <div style={{ fontSize: '12px', marginBottom: '24px' }}>
            <strong>Разом на суму:</strong> {numToWords(total)} (без ПДВ)
          </div>

          {/* Signatures */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginTop: '24px', fontSize: '12px' }}>
            <div>
              <div>Відпустив: ____________________</div>
              <div style={{ marginTop: '4px', color: '#555' }}>(підпис, прізвище)</div>
            </div>
            <div>
              <div>Отримав: ____________________</div>
              <div style={{ marginTop: '4px', color: '#555' }}>(підпис, прізвище)</div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
