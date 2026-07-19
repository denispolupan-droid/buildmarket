'use client';

import { hryvniaInWords } from "../../../lib/number-to-words";
import { useState, useRef } from 'react';
import { Printer, FileSpreadsheet, Mail } from 'lucide-react';
import InvoiceMessengerButtons from '../../components/InvoiceMessengerButtons';

function formatIban(raw: string) {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

type Item = { sku: string; name: string; brand?: string | null; qty: number; price: number };
type Order = {
  id: string;
  order_number: number;
  created_at: string;
  company: string | null;
  contact: string;
  phone: string;
  email: string;
  delivery_address: string | null;
  delivery_city_name: string | null;
  items: Item[];
  total_price: number;
  payment_due_date?: string | null;
};

export default function InvoicePrint({
  order, bankRecipient, bankIban, bankName, bankEdrpou, bankAddress = '', signatoryName = '',
}: {
  order: Order;
  bankRecipient: string;
  bankIban: string;
  bankName: string;
  bankEdrpou: string;
  bankAddress?: string;
  signatoryName?: string;
}) {
  const [emailInput, setEmailInput]       = useState(order.email ?? '');
  const [sending, setSending]             = useState(false);
  const [sendResult, setSendResult]       = useState<'ok' | 'err' | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);

  type CustomerHit = { id: string; name: string; company: string | null; email: string | null };
  const [customerQ, setCustomerQ]         = useState('');
  const [customerHits, setCustomerHits]   = useState<CustomerHit[]>([]);
  const [showDrop, setShowDrop]           = useState(false);
  const searchTimer                       = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCustomerSearch(q: string) {
    setCustomerQ(q);
    setShowDrop(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) { setCustomerHits([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(q)}&limit=8`);
        if (res.ok) setCustomerHits(await res.json());
      } catch { /* silent */ }
    }, 250);
  }

  function pickCustomer(hit: CustomerHit) {
    if (hit.email) setEmailInput(hit.email);
    setCustomerQ(hit.company || hit.name);
    setShowDrop(false);
    setCustomerHits([]);
  }

  async function sendEmail() {
    setSending(true); setSendResult(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput }),
      });
      setSendResult(res.ok ? 'ok' : 'err');
    } catch { setSendResult('err'); }
    setSending(false);
  }

  async function exportExcel() {
    const res = await fetch(`/api/admin/orders/${order.id}/invoice-excel`);
    if (!res.ok) { alert('Помилка генерації Excel'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Рахунок_${order.order_number}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const date = new Date(order.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
  const ibanDisplay  = formatIban(bankIban);
  const buyerName    = order.company || order.contact;
  const total        = Number(order.total_price);
  const dueDateStr   = order.payment_due_date
    ? new Date(order.payment_due_date).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const deliveryAddr = [order.delivery_city_name, order.delivery_address].filter(Boolean).join(', ');

  return (
    <>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .doc-wrap {
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            padding: 9mm 13mm !important;
          }
          .print-page-bg { background: white !important; padding: 0 !important; }
        }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; }
        table { border-collapse: collapse; width: 100%; }
      `}</style>

      {/* ── Floating toolbar ── */}
      <div className="no-print" style={{
        position: 'fixed', bottom: '28px', right: '24px', zIndex: 100,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px',
      }}>
        {showEmailForm && (
          <div style={{
            background: '#fff', borderRadius: '10px', padding: '12px 14px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)', width: '320px',
          }}>
            {/* Customer search */}
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <input
                value={customerQ}
                onChange={e => handleCustomerSearch(e.target.value)}
                onFocus={() => customerQ.length >= 2 && setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                placeholder="Пошук контрагента..."
                style={{
                  width: '100%', height: '34px', padding: '0 10px', boxSizing: 'border-box',
                  borderRadius: '6px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none',
                }}
              />
              {showDrop && customerHits.length > 0 && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '4px',
                  background: '#fff', border: '1px solid #CBD5E1', borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, overflow: 'hidden',
                }}>
                  {customerHits.map(hit => (
                    <div
                      key={hit.id}
                      onMouseDown={() => pickCustomer(hit)}
                      style={{
                        padding: '8px 11px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9',
                        fontSize: '12px', lineHeight: '1.4',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    >
                      <div style={{ fontWeight: 600, color: '#111' }}>{hit.company || hit.name}</div>
                      {hit.company && hit.name !== hit.company && (
                        <div style={{ color: '#6B7280', fontSize: '11px' }}>{hit.name}</div>
                      )}
                      <div style={{ color: '#3B82F6', fontSize: '11px' }}>{hit.email || 'без email'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Email row */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)}
                placeholder="email@example.com"
                style={{
                  flex: 1, height: '34px', padding: '0 10px',
                  borderRadius: '6px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none',
                }}
              />
              <button
                onClick={sendEmail} disabled={sending || !emailInput}
                style={{
                  height: '34px', padding: '0 14px', borderRadius: '6px',
                  background: '#7C3AED', color: '#fff', fontSize: '13px', fontWeight: 700,
                  border: 'none', cursor: 'pointer', opacity: sending || !emailInput ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {sending ? '...' : sendResult === 'ok' ? '✓ Надіслано' : sendResult === 'err' ? '✗ Помилка' : 'Надіслати'}
              </button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <InvoiceMessengerButtons variant="toolbar"
            phone={order.phone} contact={order.contact}
            orderNumber={order.order_number} orderId={order.id}
            total={total} />
          <button onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '44px', padding: '0 18px', borderRadius: '10px', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(21,128,61,0.3)' }}>
            <FileSpreadsheet size={15} /> Excel
          </button>
          <button onClick={() => { setShowEmailForm(v => !v); setSendResult(null); }} style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '44px', padding: '0 18px', borderRadius: '10px', background: '#5B21B6', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(91,33,182,0.3)' }}>
            <Mail size={15} /> Email
          </button>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '44px', padding: '0 20px', borderRadius: '10px', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(30,58,95,0.3)' }}>
            <Printer size={15} /> Друк
          </button>
        </div>
      </div>

      {/* ── Document ── */}
      <div className="print-page-bg" style={{ background: '#E8ECF0', minHeight: '100vh', padding: '28px 16px' }}>
        <div className="doc-wrap" style={{
          maxWidth: '210mm', margin: '0 auto', background: '#fff',
          boxShadow: '0 2px 20px rgba(0,0,0,0.13)', borderRadius: '3px',
          padding: '22px 30px 30px',
        }}>

          {/* 1. Warning notice */}
          <div style={{
            border: '1px solid #CBD5E1', borderRadius: '4px', padding: '7px 14px', marginBottom: '14px',
            fontSize: '10px', color: '#4A5568', lineHeight: '1.55', textAlign: 'center',
            background: '#FAFBFC',
          }}>
            <strong style={{ color: '#1a1a1a' }}>Увага!</strong> Сплата даного рахунку означає згоду з умовами постачання товару.
            Повідомлення про сплату обов&apos;язкове, інакше не гарантується наявність товару на складі.
            Товар відпускається за фактом приходу грошей на п/р Постачальника, самовивозом,
            при наявності довіреності та паспорту.
          </div>

          {/* 2. Payment order sample */}
          <div style={{
            border: '1px solid #C5D5E8', borderRadius: '5px',
            marginBottom: '18px', overflow: 'hidden',
          }}>
            <div style={{
              background: '#DCE8F5', padding: '5px 14px',
              fontSize: '9.5px', color: '#3D5A80', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              Зразок заповнення платіжного доручення
            </div>
            <div style={{ background: '#F4F8FD', padding: '10px 14px 12px' }}>
              <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '9px', color: '#6B7E99', marginBottom: '2px', letterSpacing: '0.04em' }}>ОДЕРЖУВАЧ</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#111' }}>{bankRecipient}</div>
                </div>
                {bankEdrpou && (
                  <div>
                    <div style={{ fontSize: '9px', color: '#6B7E99', marginBottom: '2px', letterSpacing: '0.04em' }}>ЄДРПОУ / ДРФО</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#111' }}>{bankEdrpou}</div>
                  </div>
                )}
              </div>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '9px', color: '#6B7E99', marginBottom: '2px', letterSpacing: '0.04em' }}>БАНК ОДЕРЖУВАЧА</div>
                <div style={{ fontSize: '11.5px', color: '#222' }}>{bankName}</div>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: '#6B7E99', marginBottom: '3px', letterSpacing: '0.04em' }}>РАХУНОК (IBAN)</div>
                <div style={{
                  fontFamily: "'Menlo', 'Monaco', 'Consolas', 'Lucida Console', monospace", fontSize: '15px', fontWeight: 700,
                  color: '#1E3A5F', letterSpacing: '0.08em',
                }}>{ibanDisplay}</div>
              </div>
            </div>
          </div>

          {/* 3. Title */}
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#111', marginBottom: '6px' }}>
            Рахунок на оплату № {order.order_number} від {date}
          </div>
          <hr style={{ border: 'none', borderTop: '2px solid #1E3A5F', marginBottom: '14px' }} />

          {/* 4. Parties */}
          <table style={{ marginBottom: '10px', fontSize: '12px', border: 'none' }}>
            <tbody>
              <tr>
                <td style={{ padding: '3px 0', width: '130px', fontWeight: 700, verticalAlign: 'top', border: 'none' }}>Постачальник:</td>
                <td style={{ padding: '3px 0', verticalAlign: 'top', border: 'none', lineHeight: '1.75' }}>
                  <strong>{bankRecipient}</strong>
                  {bankEdrpou && <><br /><span style={{ color: '#555' }}>ЄДРПОУ/ДРФО: {bankEdrpou}</span></>}
                  {bankAddress && <><br /><span style={{ color: '#555' }}>Адреса: {bankAddress}</span></>}
                  {bankName && <><br /><span style={{ color: '#555' }}>Банк: {bankName}</span></>}
                  {bankIban && <><br /><span style={{ color: '#555' }}>IBAN: <span style={{ fontFamily: "'Menlo', 'Monaco', 'Consolas', 'Lucida Console', monospace", color: '#1E3A5F', fontWeight: 600 }}>{ibanDisplay}</span></span></>}
                </td>
              </tr>
              <tr><td colSpan={2} style={{ border: 'none', padding: '2px 0' }}><hr style={{ border: 'none', borderTop: '1px dashed #ccc' }} /></td></tr>
              <tr>
                <td style={{ padding: '3px 0', fontWeight: 700, verticalAlign: 'top', border: 'none' }}>Покупець:</td>
                <td style={{ padding: '3px 0', verticalAlign: 'top', border: 'none' }}>
                  {buyerName}
                  {order.company && order.contact !== order.company && <><br />{order.contact}</>}
                  {order.phone && <><br /><span style={{ color: '#555' }}>Тел.: {order.phone}</span></>}
                </td>
              </tr>
              {(dueDateStr || deliveryAddr) && (
                <tr><td colSpan={2} style={{ border: 'none', padding: '2px 0' }}><hr style={{ border: 'none', borderTop: '1px dashed #ccc' }} /></td></tr>
              )}
              {dueDateStr && (
                <tr>
                  <td style={{ padding: '3px 0', fontWeight: 700, border: 'none' }}>Строк оплати:</td>
                  <td style={{ padding: '3px 0', border: 'none' }}>до {dueDateStr}</td>
                </tr>
              )}
              {deliveryAddr && (
                <tr>
                  <td style={{ padding: '3px 0', fontWeight: 700, border: 'none' }}>Адреса доставки:</td>
                  <td style={{ padding: '3px 0', border: 'none', color: '#333' }}>{deliveryAddr}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 5. Items table */}
          <table style={{ marginBottom: '6px', fontSize: '11px', border: '1px solid #999' }}>
            <thead>
              <tr style={{ background: '#1E3A5F' }}>
                <th style={{ border: '1px solid #4B6B8F', padding: '6px 6px', color: '#fff', width: '28px', textAlign: 'center' }}>№</th>
                <th style={{ border: '1px solid #4B6B8F', padding: '6px 8px', color: '#fff', width: '88px', textAlign: 'center' }}>Код</th>
                <th style={{ border: '1px solid #4B6B8F', padding: '6px 8px', color: '#fff', textAlign: 'left' }}>Найменування товару</th>
                <th style={{ border: '1px solid #4B6B8F', padding: '6px 6px', color: '#fff', width: '52px', textAlign: 'center' }}>Кіл-сть</th>
                <th style={{ border: '1px solid #4B6B8F', padding: '6px 6px', color: '#fff', width: '36px', textAlign: 'center' }}>Од.</th>
                <th style={{ border: '1px solid #4B6B8F', padding: '6px 8px', color: '#fff', width: '72px', textAlign: 'right' }}>Ціна</th>
                <th style={{ border: '1px solid #4B6B8F', padding: '6px 8px', color: '#fff', width: '72px', textAlign: 'right' }}>Сума</th>
              </tr>
            </thead>
            <tbody>
              {(order.items as Item[]).map((item, idx) => (
                <tr key={item.sku} style={{ background: idx % 2 === 1 ? '#F8FAFC' : '#fff' }}>
                  <td style={{ border: '1px solid #ccc', padding: '5px 6px', textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace', fontSize: '10px', color: '#444' }}>{item.sku}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}>{[item.brand, item.name].filter(Boolean).join(' ')}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 6px', textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 6px', textAlign: 'center', color: '#555' }}>шт</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>{Number(item.price).toFixed(2)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{(item.qty * Number(item.price)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right', fontSize: '11px', color: '#555' }}>Всього без ПДВ:</td>
                <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          {/* 6. Sum summary */}
          <div style={{ fontSize: '11px', color: '#333', marginBottom: '2px' }}>
            Всього найменувань: {order.items.length}, на суму <strong>{total.toFixed(2)} грн</strong>
          </div>
          <div style={{ fontSize: '11px', color: '#333', marginBottom: '20px', fontStyle: 'italic' }}>
            {hryvniaInWords(total)}
          </div>

          {/* 7. Payment purpose */}
          <div style={{ fontSize: '11px', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '3px', background: '#F9FAFB', marginBottom: '22px', color: '#333' }}>
            <strong>Призначення платежу:</strong>{' '}
            Оплата за замовлення №{order.order_number} від {date}. Без ПДВ.
          </div>

          {/* 8. Signature */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '12px', color: '#111' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', gap: '40px', alignItems: 'baseline' }}>
                <span>Виписав(ла):</span>
                <span style={{ borderBottom: '1px solid #000', minWidth: '160px', display: 'inline-block', textAlign: 'center' }}>
                  {signatoryName || ' '}
                </span>
              </div>
              {!signatoryName && (
                <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '3px', marginLeft: '80px' }}>(підпис, прізвище)</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
