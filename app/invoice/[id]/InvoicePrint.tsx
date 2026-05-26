'use client';

import { Printer, FileSpreadsheet } from 'lucide-react';

/** UA29-char IBAN → groups of 4 with spaces */
function formatIban(raw: string) {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s; // non-breaking space so it doesn't break mid-group
}

type Item = { sku: string; name: string; brand: string; qty: number; price: number };
type Order = {
  id: string;
  order_number: number;
  created_at: string;
  company: string | null;
  contact: string;
  phone: string;
  email: string;
  delivery_address: string | null;
  items: Item[];
  total_price: number;
};

export default function InvoicePrint({ order, bankRecipient, bankIban, bankName, bankEdrpou }: {
  order: Order;
  bankRecipient: string;
  bankIban: string;
  bankName: string;
  bankEdrpou: string;
}) {
  const date = new Date(order.created_at).toLocaleDateString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const ibanDisplay = formatIban(bankIban);

  async function exportExcel() {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const rows: (string | number)[][] = [
      [`Рахунок-фактура №${order.order_number}`, '', '', '', ''],
      ['Дата:', date, '', '', ''],
      ['Платник:', order.company || order.contact, '', '', ''],
      order.delivery_address ? ['Доставка:', order.delivery_address, '', '', ''] : [],
      [],
      ['Артикул', 'Бренд', 'Назва', 'Кількість', 'Ціна, грн', 'Сума, грн'],
      ...order.items.map(i => [i.sku, i.brand, i.name, i.qty, i.price, +(i.price * i.qty).toFixed(2)]),
      [],
      ['', '', '', '', 'РАЗОМ:', +order.total_price.toFixed(2)],
      [],
      ['Реквізити для оплати', '', '', '', '', ''],
      ['Отримувач:', bankRecipient, '', '', '', ''],
      ['IBAN:', bankIban, '', '', '', ''],
      ['Банк:', bankName, '', '', '', ''],
      ['ЄДРПОУ:', bankEdrpou, '', '', '', ''],
      ['Призначення:', `Оплата за замовлення №${order.order_number}`, '', '', '', ''],
    ].filter(r => r.length > 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws = XLSX.utils.aoa_to_sheet(rows as any);
    ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 44 }, { wch: 10 }, { wch: 13 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Рахунок');
    XLSX.writeFile(wb, `Рахунок_${order.order_number}.xlsx`);
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .invoice-wrap { box-shadow: none !important; border: none !important; margin: 0 !important; border-radius: 0 !important; }
        }
        @page { margin: 16mm; }
      `}</style>

      {/* Action buttons */}
      <div className="no-print" style={{
        position: 'fixed', bottom: '32px', right: '80px', zIndex: 100,
        display: 'flex', gap: '10px',
      }}>
        <button
          onClick={exportExcel}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            height: '48px', padding: '0 20px', borderRadius: '12px',
            background: '#15803D', color: '#fff', fontSize: '14px', fontWeight: 700,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(21,128,61,0.3)',
          }}
        >
          <FileSpreadsheet size={16} />
          Excel
        </button>
        <button
          onClick={() => window.print()}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            height: '48px', padding: '0 24px', borderRadius: '12px',
            background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 700,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(30,58,95,0.3)',
          }}
        >
          <Printer size={16} />
          PDF
        </button>
      </div>

      <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: '32px 16px' }}>
        <div className="invoice-wrap" style={{
          maxWidth: '700px', margin: '0 auto', background: '#fff',
          borderRadius: '16px', border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{ background: '#1E3A5F', padding: '28px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: '#fff', fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px' }}>FIXLINE</div>
              <div style={{ color: '#94A3B8', fontSize: '12px', marginTop: '2px' }}>B2B платформа будівельної хімії</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>Рахунок-фактура</div>
              <div style={{ color: '#94A3B8', fontSize: '13px', marginTop: '2px' }}>№ {order.order_number} від {date}</div>
            </div>
          </div>

          {/* Client + delivery */}
          <div style={{ padding: '24px 36px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Платник</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{order.company || order.contact}</div>
              <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{order.contact}</div>
              <div style={{ fontSize: '13px', color: '#64748B' }}>{order.phone}</div>
              <div style={{ fontSize: '13px', color: '#64748B' }}>{order.email}</div>
            </div>
            {order.delivery_address && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Доставка</div>
                <div style={{ fontSize: '13px', color: '#64748B' }}>{order.delivery_address}</div>
              </div>
            )}
          </div>

          {/* Items */}
          <div style={{ padding: '24px 36px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Товар', 'Кіл-ть', 'Ціна', 'Сума'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 12px', fontSize: '11px', fontWeight: 700,
                      color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: '2px solid #E2E8F0',
                      textAlign: i === 0 ? 'left' : 'right',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(order.items as Item[]).map(item => (
                  <tr key={item.sku}>
                    <td style={{ padding: '12px', borderBottom: '1px solid #F1F5F9' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{item.brand} · {item.sku}</div>
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #F1F5F9', textAlign: 'right', fontSize: '13px', color: '#374151' }}>{item.qty}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #F1F5F9', textAlign: 'right', fontSize: '13px', color: '#374151' }}>{item.price.toFixed(2)} грн</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #F1F5F9', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#1E3A5F' }}>{(item.price * item.qty).toFixed(2)} грн</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '16px 20px', minWidth: '240px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
                  <span>Без ПДВ</span><span>{order.total_price.toFixed(2)} грн</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, color: '#0F172A', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                  <span>До сплати</span>
                  <span style={{ color: '#1E3A5F' }}>{order.total_price.toFixed(2)} грн</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bank details */}
          <div style={{ margin: '0 36px 28px', background: '#EFF4FF', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E3A5F', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
              Реквізити для оплати
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 12px', alignItems: 'start' }}>
              {([
                ['Отримувач', bankRecipient],
                ['IBAN', ibanDisplay],
                ['Банк', bankName],
                ['ЄДРПОУ', bankEdrpou],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <span style={{ fontSize: '12px', color: '#64748B', paddingTop: '1px' }}>{k}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', wordBreak: 'break-word' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748B' }}>
              Призначення: <strong style={{ color: '#0F172A' }}>Оплата за замовлення №{order.order_number}</strong>
            </div>
          </div>

          {/* Footer */}
          <div style={{ background: '#F8FAFC', padding: '14px 36px', borderTop: '1px solid #F1F5F9', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>info@fixline.com.ua · fixline.com.ua</div>
          </div>

        </div>
      </div>
    </>
  );
}
