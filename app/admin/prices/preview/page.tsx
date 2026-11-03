'use client';
import { Suspense, useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Modal } from '../../../components/admin/ui/Modal';

const btnPrimary: React.CSSProperties = {
  background: 'var(--color-info)', color: '#fff', border: 'none',
  padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
};
const btnSecondary: React.CSSProperties = {
  background: '#fff', color: '#374151', border: '1.5px solid #E5E7EB',
  padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
};

function PreviewContent() {
  const searchParams = useSearchParams();
  const iframeRef    = useRef<HTMLIFrameElement>(null);

  const [blobUrl,     setBlobUrl]     = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState('');
  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [emailModal,  setEmailModal]  = useState(false);
  const [emailInput,  setEmailInput]  = useState('');
  const [emailMsg,    setEmailMsg]    = useState('');
  const [sending,     setSending]     = useState(false);

  const params  = searchParams.toString();
  const pdfUrl  = `/api/admin/prices/pricelist?format=pdf&${params}`;
  const dateStr = new Date().toISOString().slice(0, 10);

  // Load PDF as blob so browser renders inline (avoids download trigger)
  useEffect(() => {
    let objectUrl = '';
    setLoading(true);
    setLoadError('');
    fetch(pdfUrl)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setLoading(false);
      })
      .catch(e => {
        setLoadError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [pdfUrl]);

  function downloadPdf() {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `pricelist_${dateStr}.pdf`;
    a.click();
  }

  async function downloadXlsx() {
    setXlsxLoading(true);
    try {
      const r = await fetch(`/api/admin/prices/pricelist?${params}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pricelist_${dateStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setXlsxLoading(false);
    }
  }

  async function sendEmail() {
    if (!emailInput.includes('@')) { setEmailMsg('Введіть коректний email'); return; }
    setSending(true);
    setEmailMsg('Надсилається...');
    try {
      const xlsxParams: Record<string, string> = {};
      searchParams.forEach((v, k) => { xlsxParams[k] = v; });
      const res = await fetch('/api/admin/prices/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, xlsxParams }),
      });
      if (res.ok) {
        setEmailMsg('Відправлено!');
        setTimeout(() => { setEmailModal(false); setEmailMsg(''); setEmailInput(''); }, 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        setEmailMsg('Помилка: ' + (err.error ?? res.status));
      }
    } catch (e) {
      setEmailMsg('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: 'Arial, sans-serif' }}>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px', background: '#fff', borderBottom: '1px solid #e5e7eb', alignItems: 'center', flexShrink: 0, height: 50 }}>
        <button style={{ ...btnPrimary, opacity: !blobUrl ? 0.5 : 1 }} disabled={!blobUrl}
          onClick={() => { try { iframeRef.current?.contentWindow?.print(); } catch { window.print(); } }}>
          Друкувати
        </button>
        <button style={{ ...btnSecondary, opacity: !blobUrl ? 0.5 : 1 }} disabled={!blobUrl} onClick={downloadPdf}>
          Скачати PDF
        </button>
        <button style={{ ...btnSecondary, opacity: xlsxLoading ? 0.5 : 1 }} disabled={xlsxLoading} onClick={downloadXlsx}>
          {xlsxLoading ? 'Завантаження...' : 'Скачати XLSX'}
        </button>
        <button style={btnSecondary} onClick={() => setEmailModal(true)}>
          Відправити на email
        </button>
      </div>

      {/* PDF / loader / error */}
      {loading && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#f1f5f9', color: 'var(--text-gray)', fontSize: 14 }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          Генерується прайс-лист…
        </div>
      )}
      {loadError && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-danger)', color: 'var(--color-danger)', fontSize: 14 }}>
          Помилка завантаження: {loadError}
        </div>
      )}
      {blobUrl && (
        <iframe
          ref={iframeRef}
          src={blobUrl}
          style={{ flex: 1, border: 'none', display: 'block' }}
          title="Прайс-лист"
        />
      )}

      {/* Email modal */}
      {emailModal && (
        <Modal open onClose={() => setEmailModal(false)} width={380} padding={0} dismissible={false} aria-label="Надіслати прайс" style={{ background: '#fff' }}>
          <div style={{ background: '#fff', padding: 24, width: '100%' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Відправити прайс-лист</h3>
            <input
              type="email"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendEmail()}
              placeholder="email@example.com"
              autoFocus
              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button style={{ ...btnPrimary, flex: 1, justifyContent: 'center', opacity: sending ? 0.5 : 1 }} disabled={sending} onClick={sendEmail}>
                Відправити
              </button>
              <button style={{ ...btnSecondary, flex: 1, justifyContent: 'center' }} onClick={() => { setEmailModal(false); setEmailMsg(''); setEmailInput(''); }}>
                Скасувати
              </button>
            </div>
            {emailMsg && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-gray)' }}>{emailMsg}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense>
      <PreviewContent />
    </Suspense>
  );
}
