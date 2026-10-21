'use client';

import { hryvniaInWords } from "../../../lib/number-to-words";
import { useState, useRef } from 'react';
import { Printer, Mail, FileDown, Copy, Check, Pencil } from 'lucide-react';
import InvoiceMessengerButtons, { copyText } from '../../components/InvoiceMessengerButtons';
import { shortFio, type Signer } from '../../../lib/signatory';
import type { VidatkovaRenderParams } from '../../../lib/vidatkova-doc';
import { formatMoney, formatQty, formatDocDate, taxIdLabel } from '../../../lib/doc-format';

function formatIban(raw: string) {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}


const TH: React.CSSProperties = { border: '1px solid #000', padding: '5px 6px', color: '#111', fontWeight: 700 };
const TD: React.CSSProperties = { border: '1px solid #000', padding: '4px 6px', color: '#111' };

// Блок підпису: посада над лінією, лінія вільна під живий підпис, ПІБ праворуч
// від неї (розшифровка), під лінією — підказки, нижче М.П. з місцем під печатку.
// Якщо підписанта не задано — порожні лінії з підказками, щоб дописати від руки.
function SignatureBlock({ label, signer }: { label: string; signer?: Signer | null }) {
  const caption: React.CSSProperties = { fontSize: '9.5px', color: '#9CA3AF', marginTop: '2px' };
  const position = signer?.position?.trim();
  const name = signer?.name ? shortFio(signer.name) : '';
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, maxWidth: '320px' }}>
      <div style={{ fontWeight: 700, marginBottom: '6px' }}>{label}:</div>
      {position
        ? <div style={{ marginBottom: '14px' }}>{position}</div>
        : <div style={{ marginBottom: '10px' }}>
            <div style={{ borderBottom: '1px solid #000', height: '16px' }} />
            <div style={caption}>(посада)</div>
          </div>}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderBottom: '1px solid #000', height: '20px' }} />
          <div style={{ ...caption, textAlign: 'center' }}>(підпис)</div>
        </div>
        <div style={{ flex: name ? '0 0 auto' : 1 }}>
          <div style={{ borderBottom: name ? 'none' : '1px solid #000', height: '20px', lineHeight: '20px', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ ...caption, textAlign: 'center' }}>{name ? ' ' : '(прізвище, ініціали)'}</div>
        </div>
      </div>
      <div style={{ marginTop: '14px', color: '#555', fontSize: '11px', minHeight: '40px' }}>М.П.</div>
    </div>
  );
}

export default function VidatkovaNakladna({
  docId, docNumber, docDate, lines, total,
  sellerName, sellerEdrpou, sellerAddress, sellerCity, sellerBank, sellerIban, sellerTaxStatus,
  buyerName, buyerPhone, buyerEdrpou, buyerAddress, orderNumber, contract, sellerSigner, buyerSigner,
  defaultEmail, isStaff = false, canEdit = false, docStatus,
}: VidatkovaRenderParams & {
  docId: string;
  defaultEmail?: string | null;
  isStaff?: boolean;
  canEdit?: boolean;
  docStatus?: string;
}) {
  const [emailInput, setEmailInput]       = useState(defaultEmail ?? '');
  const [sending, setSending]             = useState(false);
  const [sendResult, setSendResult]       = useState<'ok' | 'err' | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [copiedKey, setCopiedKey]         = useState<string | null>(null);

  async function copyValue(key: string, value: string) {
    await copyText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 2000);
  }

  // Реквізит, який копіюється одним натисканням (IBAN — без пробілів).
  function CopyTap({ k, value, children }: { k: string; value: string; children: React.ReactNode }) {
    const copied = copiedKey === k;
    return (
      <span
        onClick={() => copyValue(k, value)}
        title="Натисніть, щоб скопіювати"
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        {children}
        <span className="no-print" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {copied
            ? <><Check size={14} color="#15803D" /><span style={{ fontSize: '10px', fontWeight: 700, color: '#15803D' }}>Скопійовано</span></>
            : <Copy size={14} color="#94A3B8" />}
        </span>
      </span>
    );
  }

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

  const date = formatDocDate(docDate);
  const ibanDisplay = formatIban(sellerIban);

  // Text copied to the clipboard when sending the delivery note via a messenger.
  const messengerMessage = [
    `Вітаємо, ${buyerName}! 🤝`,
    `Ваша видаткова накладна № ${docNumber} на суму ${formatMoney(total)} грн.`,
    `Переглянути онлайн: ${typeof window !== 'undefined' ? window.location.origin : 'https://fixline.com.ua'}/vidatkova/${docId}`,
  ].join('\n');

  // Print the generated PDF (guaranteed A4 portrait — identical to the download),
  // instead of window.print() on the HTML which the browser can render landscape.
  function printPdf() {
    const src = `/api/vidatkova/${docId}/pdf?inline=1`;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    iframe.onload = () => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      catch { window.open(src, '_blank'); }
    };
    iframe.src = src;
    document.body.appendChild(iframe);
  }

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
        @media screen and (max-width: 640px) {
          .print-page-bg { padding: 12px 8px 110px !important; }
          .doc-wrap { padding: 18px 14px 24px !important; }
          /* Реквізити: мітка над значенням на всю ширину, а не вузька колонка */
          .vd-parties td { display: block; width: auto !important; padding: 1px 0 !important; }
          .vd-parties td:first-child { padding-top: 8px !important; }
          /* Таблиця товарів: горизонтальний скрол у натуральну ширину */
          .vd-items-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -14px; padding: 0 14px; }
          .vd-items { min-width: 540px; }
          /* Підписи: два блоки в стовпчик, а не в ряд (щоб "Отримав" не вилазив) */
          .vd-sigs { flex-direction: column; gap: 22px !important; }
          .vd-sigs > div { width: 100%; }
        }
      `}</style>

      {/* Floating toolbar */}
      <div className="no-print" style={{ position: 'fixed', bottom: '28px', right: '24px', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
        {isStaff && showEmailForm && (
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
          {/* Staff-only send controls */}
          {isStaff && (
            <>
              <InvoiceMessengerButtons
                variant="toolbar"
                phone={buyerPhone ?? ''}
                contact={buyerName}
                total={total}
                message={messengerMessage}
              />
              <button
                onClick={() => { setShowEmailForm(v => !v); setSendResult(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '44px', padding: '0 18px', borderRadius: '10px', background: '#5B21B6', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(91,33,182,0.3)' }}
              >
                <Mail size={15} /> Email
              </button>
            </>
          )}

          {/* Available to everyone (incl. clients opening the link): download PDF */}
          <a
            href={`/api/vidatkova/${docId}/pdf`}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '44px', padding: '0 20px', borderRadius: '10px', background: '#B91C1C', color: '#fff', fontSize: '13px', fontWeight: 700, textDecoration: 'none', boxShadow: '0 3px 12px rgba(185,28,28,0.3)' }}
          >
            <FileDown size={15} /> Завантажити PDF
          </a>

          {/* Правка — не тут, а на сторінці документа: ця форма відкрита і в
              покупця за посиланням, тож редагування живе за адмінським входом.
              Підпис різний навмисно: чернетку правимо напряму, проведену
              спершу сторнуємо, і менеджер має бачити це ДО кліку. */}
          {canEdit && (
            <a
              href={`/admin/accounting/documents/${docId}`}
              title={docStatus === 'draft'
                ? 'Змінити склад, кількість, ціни або дату'
                : 'Накладна проведена: правки — через «Виправити» (сторно + нова чернетка)'}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '44px', padding: '0 18px', borderRadius: '10px', background: 'var(--bg-card, #fff)', color: '#1E3A5F', fontSize: '13px', fontWeight: 700, textDecoration: 'none', border: '1.5px solid #C7D7F5' }}
            >
              <Pencil size={15} /> {docStatus === 'draft' ? 'Редагувати' : 'Виправити'}
            </a>
          )}

          {isStaff && (
            <button
              onClick={printPdf}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '44px', padding: '0 20px', borderRadius: '10px', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(30,58,95,0.3)' }}
            >
              <Printer size={15} /> Друк
            </button>
          )}
        </div>
      </div>

      {/* Document */}
      <div className="print-page-bg" style={{ background: '#E8ECF0', minHeight: '100vh', padding: '28px 16px' }}>
        <div className="doc-wrap" style={{ maxWidth: '210mm', width: '100%', margin: '0 auto', background: '#fff', boxShadow: '0 2px 20px rgba(0,0,0,0.13)', borderRadius: '3px', padding: '22px 30px 30px', boxSizing: 'border-box' }}>

          {/* Title */}
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#111', marginBottom: '4px' }}>
            Видаткова накладна № {docNumber} від {date}
          </div>
          {(sellerCity || orderNumber || contract) && (
            <div style={{ fontSize: '11px', color: '#555', marginBottom: '6px' }}>
              {[
                sellerCity && `Місце складання: ${sellerCity}`,
                contract && `Договір ${contract}`,
                orderNumber && `Підстава: замовлення №${orderNumber}`,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
          <hr style={{ border: 'none', borderTop: '1.5px solid #111', marginBottom: '14px' }} />

          {/* Parties */}
          <table className="vd-parties" style={{ marginBottom: '10px', fontSize: '12px', border: 'none' }}>
            <tbody>
              <tr>
                <td style={{ padding: '3px 0', width: '130px', fontWeight: 700, verticalAlign: 'top', border: 'none' }}>Постачальник:</td>
                <td style={{ padding: '3px 0', verticalAlign: 'top', border: 'none', lineHeight: '1.75' }}>
                  <strong>{sellerName}</strong>
                  {sellerEdrpou && <><br /><span style={{ color: '#555' }}>{taxIdLabel(sellerEdrpou)}: <CopyTap k="edrpou" value={sellerEdrpou}>{sellerEdrpou}</CopyTap></span></>}
                  {sellerAddress && <><br /><span style={{ color: '#555' }}>Адреса: {sellerAddress}</span></>}
                  {sellerBank && <><br /><span style={{ color: '#555' }}>Банк: {sellerBank}</span></>}
                  {sellerIban && <><br /><span style={{ color: '#555' }}>IBAN: <CopyTap k="iban" value={sellerIban.replace(/\s/g, '')}><span style={{ color: '#111', fontWeight: 600 }}>{ibanDisplay}</span></CopyTap></span></>}
                  {sellerTaxStatus && <><br /><span style={{ color: '#555' }}>{sellerTaxStatus}</span></>}
                </td>
              </tr>
              <tr><td colSpan={2} style={{ border: 'none', padding: '2px 0' }}><hr style={{ border: 'none', borderTop: '1px dashed #ccc' }} /></td></tr>
              <tr>
                <td style={{ padding: '3px 0', fontWeight: 700, verticalAlign: 'top', border: 'none' }}>Покупець:</td>
                <td style={{ padding: '3px 0', verticalAlign: 'top', border: 'none', lineHeight: '1.75' }}>
                  <strong>{buyerName}</strong>
                  {buyerEdrpou && <><br /><span style={{ color: '#555' }}>{taxIdLabel(buyerEdrpou)}: {buyerEdrpou}</span></>}
                  {buyerAddress && <><br /><span style={{ color: '#555' }}>Адреса: {buyerAddress}</span></>}
                  {buyerPhone && <><br /><span style={{ color: '#555' }}>Тел.: {buyerPhone}</span></>}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Items table */}
          <div className="vd-items-wrap">
          {/* Таблиця в стилі друкованих форм 1С: тонкі чорні рамки, сіра шапка, без «зебри» */}
          <table className="vd-items" style={{ marginBottom: '6px', fontSize: '11px', border: '1px solid #000' }}>
            <thead>
              <tr style={{ background: '#F2F2F2' }}>
                <th style={{ ...TH, width: '28px', textAlign: 'center' }}>№</th>
                <th style={{ ...TH, width: '84px', textAlign: 'center' }}>Код</th>
                <th style={{ ...TH, textAlign: 'center' }}>Найменування товару</th>
                <th style={{ ...TH, width: '64px', textAlign: 'center' }}>Кількість</th>
                <th style={{ ...TH, width: '40px', textAlign: 'center' }}>Од.</th>
                <th style={{ ...TH, width: '78px', textAlign: 'center' }}>Ціна, грн</th>
                <th style={{ ...TH, width: '86px', textAlign: 'center' }}>Сума, грн</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((item, idx) => (
                <tr key={`${item.sku}-${idx}`}>
                  <td style={{ ...TD, textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ ...TD, textAlign: 'center', fontSize: '10px' }}>{item.sku}</td>
                  <td style={TD}>{item.name}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{formatQty(item.qty)}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(item.price)}</td>
                  <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(item.qty * item.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', fontSize: '12px', padding: '4px 0', marginBottom: '2px' }}>
            <strong>Разом без ПДВ:</strong>
            <strong style={{ display: 'inline-block', minWidth: '86px', textAlign: 'right', paddingRight: '6px', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>{formatMoney(total)}</strong>
          </div>

          {/* Sum summary */}
          <div style={{ fontSize: '11px', color: '#111', marginBottom: '2px' }}>
            Всього найменувань: {lines.length}, на суму {formatMoney(total)} грн
          </div>
          <div style={{ fontSize: '12px', color: '#111', marginBottom: '28px', fontWeight: 700 }}>
            {hryvniaInWords(total)}, без ПДВ
          </div>

          {/* Signatures: посада й ПІБ поруч і під лінією, лінія вільна під підпис, М.П. — під печатку */}
          <div className="vd-sigs" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#111', gap: '40px' }}>
            <SignatureBlock label="Відпустив(ла)" signer={sellerSigner} />
            <SignatureBlock label="Отримав(ла)" signer={buyerSigner} />
          </div>

        </div>
      </div>
    </>
  );
}
