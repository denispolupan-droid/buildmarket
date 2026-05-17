'use client';

import { useState } from 'react';
import { Check, Loader2, Mail } from 'lucide-react';

type Props = {
  initialFromEmail:    string;
  initialFromName:     string;
  initialAdminEmail:   string;
  initialContactName:  string;
  initialContactPhone: string;
};

const inp: React.CSSProperties = {
  width: '100%', height: '40px', padding: '0 12px',
  border: '1.5px solid #E2E8F0', borderRadius: '8px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#0F172A',
};
const lbl: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: '#64748B',
  display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function EmailSettings({ initialFromEmail, initialFromName, initialAdminEmail, initialContactName, initialContactPhone }: Props) {
  const [fromEmail,     setFromEmail]     = useState(initialFromEmail);
  const [fromName,      setFromName]      = useState(initialFromName);
  const [adminEmail,    setAdminEmail]    = useState(initialAdminEmail);
  const [contactName,   setContactName]   = useState(initialContactName);
  const [contactPhone,  setContactPhone]  = useState(initialContactPhone);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState('');

  async function handleSave() {
    setSaving(true); setSaved(false); setError('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders_from_email:    fromEmail.trim(),
          orders_from_name:     fromName.trim(),
          admin_email:          adminEmail.trim(),
          company_contact_name:  contactName.trim(),
          company_contact_phone: contactPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка збереження'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { setError('Помилка мережі'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '24px', marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <Mail size={18} color="#1E3A5F" />
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Пошта</div>
          <div style={{ fontSize: '12px', color: '#94A3B8' }}>Email для відправки листів постачальникам та адмін-нотифікацій</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={lbl}>Ім&apos;я відправника</label>
            <input style={inp} value={fromName} onChange={e => setFromName(e.target.value)}
              placeholder="FIXLINE" />
          </div>
          <div>
            <label style={lbl}>Email відправника</label>
            <input style={inp} type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)}
              placeholder="orders@fixline.com.ua" />
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
              Використовується як FROM при відправці замовлень постачальникам
            </div>
          </div>
        </div>

        <div>
          <label style={lbl}>Email адміністратора</label>
          <input style={{ ...inp, maxWidth: '320px' }} type="email" value={adminEmail}
            onChange={e => setAdminEmail(e.target.value)}
            placeholder="admin@fixline.com.ua" />
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
            Отримує копії листів та системні нотифікації
          </div>
        </div>

        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>Контактні дані компанії</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={lbl}>Контактна особа</label>
              <input style={inp} value={contactName} onChange={e => setContactName(e.target.value)}
                placeholder="Іван Іваненко" />
              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
                Відображається в листах постачальникам
              </div>
            </div>
            <div>
              <label style={lbl}>Телефон</label>
              <input style={inp} value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                placeholder="+380671234567" />
              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
                Для зворотного зв&apos;язку з постачальниками
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ fontSize: '13px', color: '#DC2626', padding: '8px 12px', background: '#FEF2F2', borderRadius: '8px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '38px', padding: '0 20px', borderRadius: '8px', border: 'none', background: saved ? '#15803D' : '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}>
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Збереження...</>
                    : saved  ? <><Check size={14} />Збережено</>
                    : 'Зберегти'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
