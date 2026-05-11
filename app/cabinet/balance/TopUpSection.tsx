'use client';

import { useState } from 'react';
import { Copy, Check, CreditCard, Banknote, ChevronDown, ChevronUp } from 'lucide-react';

const IBAN      = 'UA803220010000026000370117963';
const RECIPIENT = 'ФОП Полупан Денис Олександрович';
const EDRPOU    = '3198107136';
const BANK      = 'АТ УНІВЕРСАЛ БАНК (Monobank)';

const AMOUNTS = [500, 1000, 2000, 5000];

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px' }}>
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: label === 'IBAN' ? 'monospace' : 'inherit', letterSpacing: label === 'IBAN' ? '0.03em' : 'normal', wordBreak: 'break-all' }}>
          {value}
        </span>
        <button onClick={copy} title="Скопіювати" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: copied ? '#15803D' : 'var(--text-muted)', flexShrink: 0, display: 'flex' }}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}

export default function TopUpSection({ partnerName }: { partnerName: string }) {
  const [amount,      setAmount]      = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const purpose = `Поповнення балансу партнера — ${partnerName}`;

  async function handlePay() {
    const num = parseFloat(amount);
    if (!num || num < 500) { setError('Мінімальна сума — 500 ₴'); return; }
    setError('');
    setLoading(true);
    const res  = await fetch('/api/cabinet/topup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ amount: num }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
    window.location.href = data.pageUrl;
  }

  return (
    <div style={{ marginBottom: '24px' }}>

      {/* ── Онлайн оплата ──────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '2px solid #4880B8', borderRadius: '14px', overflow: 'hidden', marginBottom: '12px' }}>
        <div style={{ background: '#1E3A5F', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CreditCard size={18} color="#fff" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Поповнити карткою онлайн</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Visa / Mastercard · Apple Pay · Google Pay</div>
          </div>
        </div>

        <div style={{ padding: '18px 20px' }}>
          {/* Quick amounts */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {AMOUNTS.map(a => (
              <button key={a} onClick={() => setAmount(String(a))} style={{
                padding: '6px 14px', borderRadius: '20px', border: '1.5px solid',
                borderColor: amount === String(a) ? '#4880B8' : 'var(--border)',
                background:  amount === String(a) ? '#EFF6FF' : 'var(--bg-soft)',
                color:       amount === String(a) ? '#1E3A5F' : 'var(--text-secondary)',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>
                {a.toLocaleString('uk-UA')} ₴
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <input
                type="number" min={500} step={100}
                value={amount}
                onChange={e => { setAmount(e.target.value); setError(''); }}
                placeholder="Інша сума (мін. 500 ₴)"
                style={{ width: '100%', height: '44px', padding: '0 14px', border: `1.5px solid ${error ? '#FCA5A5' : 'var(--border)'}`, borderRadius: '9px', fontSize: '14px', background: 'var(--bg-soft)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
              />
              {error && <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px' }}>{error}</div>}
            </div>
            <button
              onClick={handlePay}
              disabled={loading}
              style={{
                height: '44px', padding: '0 22px', borderRadius: '9px', border: 'none',
                background: loading ? '#94A3B8' : '#1E3A5F',
                color: '#fff', fontSize: '14px', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: '7px',
              }}
            >
              <CreditCard size={15} />
              {loading ? 'Завантаження...' : 'Оплата карткою онлайн'}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Visa · Mastercard · Apple Pay · Google Pay
          </div>
        </div>
      </div>

      {/* ── Банківський переказ (згорнутий) ────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <button
          onClick={() => setShowDetails(v => !v)}
          style={{ width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Banknote size={16} color="var(--text-secondary)" />
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Банківський переказ (вручну)</span>
          </div>
          {showDetails ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
        </button>

        {showDetails && (
          <div style={{ padding: '4px 20px 18px', borderTop: '1px solid var(--border)' }}>
            <CopyField label="Одержувач" value={RECIPIENT} />
            <CopyField label="IBAN" value={IBAN} />
            <CopyField label="ЄДРПОУ" value={EDRPOU} />
            <CopyField label="Банк" value={BANK} />
            <CopyField label="Призначення платежу" value={purpose} />
            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', padding: '10px 12px', marginTop: '8px', fontSize: '12px', color: '#92400E', lineHeight: 1.5 }}>
              Вкажіть призначення платежу точно як вказано вище. Баланс поповнюється протягом 1 робочого дня.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
