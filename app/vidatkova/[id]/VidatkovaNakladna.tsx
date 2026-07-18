'use client';

import { hryvniaInWords } from "../../../lib/number-to-words";
import { useState, useRef } from 'react';
import { Printer, Mail } from 'lucide-react';

function formatIban(raw: string) {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

type PrintLine = { sku: string; name: string; qty: number; price: number };

export default function VidatkovaNakladna({
  docId, docNumber, docDate, lines, total,
  sellerName, sellerEdrpou, sellerAddress, sellerBank, sellerIban,
  buyerName, buyerPhone, orderNumber, signatoryName,
  defaultEmail,
}: {
  docId: string;
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
  orderNumber?: number | null;
  signatoryName?: string;
  defaultEmail?: string | null;
}) {
  const [emailInput, setEmailInput]       = useState(defaultEmail ?? '');
  const [sending, setSending]             = useState(false);
  const [sendResult, setSendResult]       = useState<'ok' | 'err' | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);

  type CustomerHit = { id: string; name: string; company: string | null; email: string | null };
  const [customerQ, setCustomerQ]   = useState('');
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([]);
  const [showDrop, setShowDrop]     = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const res = await fetch(`/api/admin/accounting/documents/${docId}/send-vidatkova`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput }),
      });
      setSendResult(res.ok ? 'ok' : 'err');
    } catch { setSendResult('err'); }
    setSending(false);
  }

  const date = new Date(docDate).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
  const ibanDisplay = formatIban(sellerIban);

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .doc-wrap { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; max-width: 100% !important; padding: 9mm 13mm !important; }
          .print-page-bg { background: white !important; padding: 0 !important; }
        }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; }
        table { border-collapse: collapse; width: 100%; }
      `}</style>

      {/* Floating toolbar */}
      <div className="no-print" style={{ position: 'fixed', bottom: '28px', right: '24px', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
        {showEmailForm && (
          <div style={{ background: '#fff', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 4px 24px rgba(0,0,0,0.15)', width: '320px' }}>
            {/* Customer search */}
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <input
                value={customerQ}
                onChange={e => handleCustomerSearch(e.target.value)}
                onFocus={() => customerQ.length >= 2 && setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                placeholder="Пошук контрагента..."
                style={{ width: '100%', height: '34px', padding: '0 10px', boxSizing: 'border-box', borderRadius: '6px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
              />
              {showDrop && customerHits.length > 0 && (
                <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '4px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, overflow: 'hidden' }}>
                  {customerHits.map(hit => (
                    <div key={hit.id} onMouseDown={() => pickCustomer(hit)}
                      style={{ padding: '8px 11px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', fontSize: '12px', lineHeight: '1.4' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    >
                      <div style={{ fontWeight: 600, color: '#111' }}>{hit.company || hit.name}</div>
                      {hit.company && hit.name !== hit.company && <div style={{ color: '#6B7280', fontSize: '11px' }}>{hit.name}</div>}
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
                style={{ flex: 1, height: '34px', padding: '0 10px', borderRadius: '6px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none' }}
              />
              <button
                onClick={sendEmail} disabled={sending || !emailInput}
                style={{ height: '34px', padding: '0 14px', borderRadius: '6px', background: '#7C3AED', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', opacity: sending || !emailInput ? 0.6 : 1, whiteSpace: 'nowrap' }}
              >
                {sending ? '...' : sendResult === 'ok' ? '✓ Надіслано' : sendResult === 'err' ? '✗ Помилка' : 'Надіслати'}
              </button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => { setShowEmailForm(v => !v); setSendResult(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '44px', padding: '0 18px', borderRadius: '10px', background: '#5B21B6', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(91,33,182,0.3)' }}
          >
            <Mail size={15} /> Email
          </button>
          <button
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '44px', padding: '0 20px', borderRadius: '10px', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(30,58,95,0.3)' }}
          >
            <Printer size={15} /> Друк
          </button>
        </div>
      </div>

      {/* Document */}
      <div className="print-page-bg" style={{ background: '#E8ECF0', minHeight: '100vh', padding: '28px 16px' }}>
        <div className="doc-wrap" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: '#fff', boxShadow: '0 2px 20px rgba(0,0,0,0.13)', borderRadius: '3px', padding: '22px 30px 30px', boxSizing: 'border-box' }}>

          {/* Title */}
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#111', marginBottom: '4px' }}>
            Видаткова накладна № {docNumber} від {date}
          </div>
          {orderNumber && (
            <div style={{ fontSize: '11px', color: '#555', marginBottom: '6px' }}>
              Підстава: замовлення №{orderNumber}
            </div>
          )}
          <hr style={{ border: 'none', borderTop: '2px solid #1E3A5F', marginBottom: '14px' }} />

          {/* Parties */}
          <table style={{ marginBottom: '10px', fontSize: '12px', border: 'none' }}>
            <tbody>
              <tr>
                <td style={{ padding: '3px 0', width: '130px', fontWeight: 700, verticalAlign: 'top', border: 'none' }}>Постачальник:</td>
                <td style={{ padding: '3px 0', verticalAlign: 'top', border: 'none', lineHeight: '1.75' }}>
                  <strong>{sellerName}</strong>
                  {sellerEdrpou && <><br /><span style={{ color: '#555' }}>ЄДРПОУ/ДРФО: {sellerEdrpou}</span></>}
                  {sellerAddress && <><br /><span style={{ color: '#555' }}>Адреса: {sellerAddress}</span></>}
                  {sellerBank && <><br /><span style={{ color: '#555' }}>Банк: {sellerBank}</span></>}
                  {sellerIban && <><br /><span style={{ color: '#555' }}>IBAN: <span style={{ fontFamily: "'Menlo','Monaco','Consolas','Lucida Console',monospace", color: '#1E3A5F', fontWeight: 600 }}>{ibanDisplay}</span></span></>}
                </td>
              </tr>
              <tr><td colSpan={2} style={{ border: 'none', padding: '2px 0' }}><hr style={{ border: 'none', borderTop: '1px dashed #ccc' }} /></td></tr>
              <tr>
                <td style={{ padding: '3px 0', fontWeight: 700, verticalAlign: 'top', border: 'none' }}>Покупець:</td>
                <td style={{ padding: '3px 0', verticalAlign: 'top', border: 'none', lineHeight: '1.75' }}>
                  {buyerName}
                  {buyerPhone && <><br /><span style={{ color: '#555' }}>Тел.: {buyerPhone}</span></>}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Items table */}
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
              {lines.map((item, idx) => (
                <tr key={item.sku} style={{ background: idx % 2 === 1 ? '#F8FAFC' : '#fff' }}>
                  <td style={{ border: '1px solid #ccc', padding: '5px 6px', textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace', fontSize: '10px', color: '#444' }}>{item.sku}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}>{item.name}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 6px', textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 6px', textAlign: 'center', color: '#555' }}>шт</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>{item.price.toFixed(2)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{(item.qty * item.price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '11px', color: '#555', padding: '5px 0', marginBottom: '2px' }}>
            <span>Всього без ПДВ:</span>
            <strong style={{ color: '#111', display: 'inline-block', width: '73px', textAlign: 'right', paddingRight: '8px', boxSizing: 'border-box' }}>{total.toFixed(2)}</strong>
          </div>

          {/* Sum summary */}
          <div style={{ fontSize: '11px', color: '#333', marginBottom: '2px' }}>
            Всього найменувань: {lines.length}, на суму <strong>{total.toFixed(2)} грн</strong>
          </div>
          <div style={{ fontSize: '11px', color: '#333', marginBottom: '28px', fontStyle: 'italic' }}>
            {hryvniaInWords(total)}
          </div>

          {/* Signatures */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#111', gap: '32px' }}>
            <div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                <span style={{ whiteSpace: 'nowrap' }}>Відпустив(ла):</span>
                <span style={{ borderBottom: '1px solid #000', minWidth: '180px', display: 'inline-block', textAlign: 'center' }}>
                  {signatoryName || ' '}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '3px', textAlign: 'right' }}>(посада, підпис, прізвище)</div>
            </div>
            <div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                <span style={{ whiteSpace: 'nowrap' }}>Отримав(ла):</span>
                <span style={{ borderBottom: '1px solid #000', minWidth: '180px', display: 'inline-block' }}>&nbsp;</span>
              </div>
              <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '3px', textAlign: 'right' }}>(посада, підпис, прізвище)</div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
