'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Printer, Mail, Plus, X, Loader2, ChevronDown, ChevronUp, Check } from 'lucide-react';

type RegisterTtn = { ttn: string; orderId: string; contact: string; amount: number };

type ScanSheet = { Ref: string; Number: string; Count: number; DateTime: string };

export default function RegisterPanel() {
  const [open,           setOpen]           = useState(true);
  const [sheets,         setSheets]         = useState<ScanSheet[]>([]);
  const [sheetsLoading,  setSheetsLoading]  = useState(true);
  const [currentRef,     setCurrentRef]     = useState<string | null>(null);
  const [currentNumber,  setCurrentNumber]  = useState<string>('');
  const [ttns,           setTtns]           = useState<RegisterTtn[]>([]);
  const [adding,         setAdding]         = useState<string | null>(null);
  const [sendModal,      setSendModal]      = useState(false);
  const [sendEmail,      setSendEmail]      = useState('');
  const [sendName,       setSendName]       = useState('');
  const [sending,        setSending]        = useState(false);
  const [sendDone,       setSendDone]       = useState(false);
  const [error,          setError]          = useState('');

  const loadSheetTtns = useCallback(async (ref: string) => {
    try {
      const res = await fetch(`/api/admin/registers?ref=${ref}`);
      const data = await res.json();
      if (data.ttns?.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setTtns(data.ttns.map((t: any) => ({ ttn: t.ttn, orderId: '', contact: t.contact, amount: Number(t.amount) || 0 })));
      }
    } catch {}
  }, []);

  const loadSheets = useCallback(async () => {
    setSheetsLoading(true);
    try {
      const res = await fetch('/api/admin/registers');
      const data = await res.json();
      const list: ScanSheet[] = data.sheets ?? [];
      setSheets(list);
      if (list.length > 0 && !currentRef) {
        const first = list[0];
        setCurrentRef(first.Ref);
        setCurrentNumber(first.Number ?? '');
        // Load TTNs from NP for the current register
        await loadSheetTtns(first.Ref);
      }
    } catch {}
    setSheetsLoading(false);
  }, [currentRef, loadSheetTtns]);

  useEffect(() => { loadSheets(); }, []);

  // Exposed globally so orders can call it
  useEffect(() => {
    (window as unknown as { __addToRegister: unknown }).__addToRegister = async (ttnNumber: string, orderId: string, contact: string, amount: number): Promise<boolean> => {
      if (ttns.find(t => t.ttn === ttnNumber)) {
        setError(`ТТН ${ttnNumber} вже в реєстрі`);
        return true; // already added — treat as success
      }
      setAdding(ttnNumber);
      setError('');
      try {
        const res = await fetch('/api/admin/registers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttnNumber, registerRef: currentRef }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Помилка'); return false; }
        if (!currentRef) {
          setCurrentRef(data.ref);
          setCurrentNumber(data.number ?? '');
        }
        setTtns(prev => [...prev, { ttn: ttnNumber, orderId, contact, amount }]);
        setOpen(true);
        return true;
      } catch { setError('Мережева помилка'); return false; }
      finally { setAdding(null); }
    };
    return () => { delete (window as unknown as { __addToRegister?: unknown }).__addToRegister; };
  }, [currentRef, ttns]);

  async function handleSend() {
    if (!sendEmail.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/registers/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: sendEmail.trim(),
          toName:  sendName.trim(),
          registerNumber: currentNumber,
          registerRef: currentRef,
          ttns,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка відправки'); return; }
      setSendDone(true);
      setTimeout(() => { setSendModal(false); setSendDone(false); }, 2000);
    } catch { setError('Мережева помилка'); }
    setSending(false);
  }

  function handlePrint() {
    if (!currentRef) return;
    window.open(`/api/admin/registers/${currentRef}/pdf`, '_blank');
  }

  const hasRegister = ttns.length > 0 || !!currentRef;

  return (
    <>
      {/* Panel */}
      <div style={{
        background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '14px',
        marginBottom: '20px', overflow: 'hidden',
        boxShadow: hasRegister ? '0 2px 12px rgba(30,58,95,0.08)' : 'none',
      }}>
        {/* Header */}
        <div
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 18px', cursor: 'pointer',
            background: hasRegister ? '#EFF4FF' : '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={16} color={hasRegister ? '#1E3A5F' : '#94A3B8'} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: hasRegister ? '#1E3A5F' : '#64748B' }}>
              Реєстр НП {currentNumber ? `#${currentNumber}` : ''}
            </span>
            {ttns.length > 0 && (
              <span style={{ background: '#1E3A5F', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
                {ttns.length} ТТН
              </span>
            )}
            {!hasRegister && <span style={{ fontSize: '12px', color: '#94A3B8' }}>Порожньо — додайте ТТН кнопкою 📋</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {hasRegister && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); handlePrint(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '30px', padding: '0 12px', borderRadius: '7px', border: '1.5px solid #E2E8F0', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}
                >
                  <Printer size={13} /> Роздрукувати
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setSendModal(true); setError(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '30px', padding: '0 12px', borderRadius: '7px', border: 'none', background: '#1E3A5F', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#fff' }}
                >
                  <Mail size={13} /> Відправити
                </button>
              </>
            )}
            {open ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
          </div>
        </div>

        {/* TTN list */}
        {open && ttns.length > 0 && (
          <div style={{ padding: '8px 18px 12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto auto', gap: '8px', padding: '6px 0', fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', borderBottom: '1px solid #F1F5F9', marginBottom: '4px' }}>
              <span>ТТН</span><span>Отримувач</span><span style={{ textAlign: 'right' }}>COD</span><span />
            </div>
            {ttns.map(t => (
              <div key={t.ttn} style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto auto', gap: '8px', padding: '5px 0', alignItems: 'center', borderBottom: '1px solid #F8FAFC' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1E3A5F', fontWeight: 600 }}>{t.ttn}</span>
                <span style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.contact}</span>
                <span style={{ fontSize: '12px', color: '#15803D', fontWeight: 600, textAlign: 'right' }}>{t.amount} ₴</span>
                <button
                  onClick={() => setTtns(prev => prev.filter(x => x.ttn !== t.ttn))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '2px', display: 'flex' }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 18px', background: '#FEF2F2', color: '#DC2626', fontSize: '12px' }}>{error}</div>
        )}
      </div>

      {/* Send modal */}
      {sendModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}        >
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '420px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={18} color="#1E3A5F" /> Відправити реєстр
              </div>
              <button onClick={() => setSendModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#64748B' }}>
                Реєстр #{currentNumber} · {ttns.length} посилок
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '5px' }}>Ім&apos;я постачальника</label>
                <input
                  value={sendName} onChange={e => setSendName(e.target.value)}
                  placeholder="Назва компанії або ПІБ"
                  style={{ width: '100%', height: '38px', padding: '0 12px', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '5px' }}>Email постачальника *</label>
                <input
                  value={sendEmail} onChange={e => setSendEmail(e.target.value)}
                  placeholder="supplier@example.com"
                  type="email"
                  style={{ width: '100%', height: '38px', padding: '0 12px', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {error && <div style={{ marginTop: '12px', fontSize: '12px', color: '#DC2626' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setSendModal(false)} style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#64748B' }}>
                Скасувати
              </button>
              <button
                onClick={handleSend} disabled={sending || !sendEmail.trim()}
                style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: sendDone ? '#16A34A' : '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !sendEmail.trim() ? 0.5 : 1 }}
              >
                {sending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Відправляємо...</>
                         : sendDone ? <><Check size={14} />Відправлено!</>
                         : <><Mail size={14} />Відправити</>}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
