'use client';

import { useState } from 'react';
import { X, Building2, User, MapPin, CalendarClock, ExternalLink } from 'lucide-react';

type OrderLite = {
  id: string;
  invoice_as_company: boolean | null;
  invoice_options: Record<string, boolean> | null;
  customer_id: string | null;
};

type Props = {
  order: OrderLite;
  onClose: () => void;
  onSaved: (v: { invoice_as_company: boolean; invoice_options: Record<string, boolean> }) => void;
};

export default function InvoiceOptionsModal({ order, onClose, onSaved }: Props) {
  const opts = order.invoice_options ?? {};
  const [asCompany, setAsCompany]       = useState(!!order.invoice_as_company);
  const [showContact, setShowContact]   = useState<boolean>(opts.show_contact ?? !order.invoice_as_company);
  const [showDelivery, setShowDelivery] = useState<boolean>(opts.show_delivery ?? true);
  const [showTerms, setShowTerms]       = useState<boolean>(opts.show_terms ?? true);
  const [saving, setSaving]             = useState(false);

  async function save() {
    setSaving(true);
    const invoice_options = { show_contact: showContact, show_delivery: showDelivery, show_terms: showTerms };
    const res = await fetch(`/api/admin/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_as_company: asCompany, invoice_options }),
    });
    setSaving(false);
    if (res.ok) { onSaved({ invoice_as_company: asCompany, invoice_options }); onClose(); }
  }

  const Toggle = ({ checked, onToggle, icon, label, hint }: {
    checked: boolean; onToggle: () => void; icon: React.ReactNode; label: string; hint?: string;
  }) => (
    <label onClick={onToggle}
      style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', padding: '10px 12px', borderRadius: '10px', border: `1.5px solid ${checked ? 'var(--brand-blue)' : 'var(--border)'}`, background: checked ? '#EAF1F8' : 'var(--bg-card)' }}>
      <div style={{ width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0, marginTop: '1px', border: `2px solid ${checked ? 'var(--brand-blue)' : 'var(--border)'}`, background: checked ? 'var(--brand-blue)' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <svg width="10" height="8" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{icon}{label}</span>
        {hint && <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.35 }}>{hint}</span>}
      </div>
    </label>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '440px', boxShadow: '0 12px 48px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>Налаштування рахунку</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '9px', overflowY: 'auto' }}>
          <Toggle checked={asCompany} onToggle={() => setAsCompany(v => !v)}
            icon={<Building2 size={13} />} label="Рахунок на підприємство"
            hint={asCompany
              ? (order.customer_id ? 'Реквізити (назва, ЄДРПОУ, адреса) — з картки контрагента.' : '⚠ Контрагент не прив’язаний — нема звідки взяти реквізити.')
              : 'Зараз рахунок на фізособу.'} />
          <Toggle checked={showContact} onToggle={() => setShowContact(v => !v)}
            icon={<User size={13} />} label="Контактна особа + телефон"
            hint="Показувати ПІБ і телефон у блоці «Покупець»." />
          <Toggle checked={showDelivery} onToggle={() => setShowDelivery(v => !v)}
            icon={<MapPin size={13} />} label="Адреса доставки"
            hint="Рядок «Адреса доставки» в рахунку." />
          <Toggle checked={showTerms} onToggle={() => setShowTerms(v => !v)}
            icon={<CalendarClock size={13} />} label="Строк оплати"
            hint="Рядок «Строк оплати» (якщо є відстрочка)." />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px', borderTop: '1px solid var(--border-light)' }}>
          <a href={`/invoice/${order.id}`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: 'var(--brand-blue)', textDecoration: 'none', marginRight: 'auto' }}>
            <ExternalLink size={13} /> Відкрити рахунок
          </a>
          <button onClick={onClose}
            style={{ height: '36px', padding: '0 16px', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Скасувати
          </button>
          <button onClick={save} disabled={saving}
            style={{ height: '36px', padding: '0 18px', borderRadius: '9px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
}
