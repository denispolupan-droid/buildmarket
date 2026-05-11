'use client';

import { useState } from 'react';
import { Copy, Check, CreditCard } from 'lucide-react';

const IBAN     = 'UA803220010000026000370117963';
const RECIPIENT = 'ФОП Полупан Денис Олександрович';
const EDRPOU   = '3198107136';
const BANK     = 'АТ УНІВЕРСАЛ БАНК (Monobank)';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
        <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: label === 'IBAN' ? 'monospace' : 'inherit', letterSpacing: label === 'IBAN' ? '0.04em' : 'normal' }}>
          {value}
        </span>
        <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: copied ? '#15803D' : 'var(--text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function TopUpSection({ partnerName }: { partnerName: string }) {
  const purpose = `Поповнення балансу партнера — ${partnerName}`;

  return (
    <div style={{ background: 'var(--bg-card)', border: '2px solid #4880B8', borderRadius: '14px', overflow: 'hidden', marginBottom: '24px' }}>
      {/* Header */}
      <div style={{ background: '#1E3A5F', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <CreditCard size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Поповнення балансу</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '1px' }}>Банківський переказ на рахунок FIXLINE</div>
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: '20px 24px' }}>
        <CopyField label="Одержувач" value={RECIPIENT} />
        <CopyField label="IBAN" value={IBAN} />
        <CopyField label="ЄДРПОУ" value={EDRPOU} />
        <CopyField label="Банк" value={BANK} />
        <CopyField label="Призначення платежу" value={purpose} />

        <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', padding: '12px 14px', marginTop: '4px' }}>
          <div style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.5 }}>
            <strong>Важливо:</strong> вкажіть призначення платежу точно як вказано вище — це дозволить нам автоматично ідентифікувати ваш платіж. Баланс поповнюється протягом 1 робочого дня.
          </div>
        </div>
      </div>
    </div>
  );
}
