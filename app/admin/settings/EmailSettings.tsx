'use client';

import { useState } from 'react';
import { Check, Loader2, Mail, Plus, X } from 'lucide-react';
import { showToast } from '../../../lib/toast';

export type Sender = { name: string; email: string };

type Props = {
  initialFromEmail:    string;
  initialFromName:     string;
  initialAdminEmail:   string;
  initialContactName:  string;
  initialContactPhone: string;
  initialExtraSenders: Sender[];
};

const inp: React.CSSProperties = {
  width: '100%', height: '40px', padding: '0 12px',
  border: '1.5px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: 'var(--text-primary)',
};
const lbl: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)',
  display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function EmailSettings({ initialFromEmail, initialFromName, initialAdminEmail, initialContactName, initialContactPhone, initialExtraSenders }: Props) {
  const [fromEmail,     setFromEmail]     = useState(initialFromEmail);
  const [fromName,      setFromName]      = useState(initialFromName);
  const [adminEmail,    setAdminEmail]    = useState(initialAdminEmail);
  const [contactName,   setContactName]   = useState(initialContactName);
  const [contactPhone,  setContactPhone]  = useState(initialContactPhone);
  const [extraSenders,  setExtraSenders]  = useState<Sender[]>(initialExtraSenders ?? []);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);

  async function handleSave() {
    // Валідація додаткових відправників: email обов'язковий і коректний
    const cleaned = extraSenders
      .map(s => ({ name: s.name.trim(), email: s.email.trim() }))
      .filter(s => s.email);
    if (cleaned.some(s => !s.email.includes('@'))) { showToast('Некоректний email у списку відправників', 'error'); return; }
    setSaving(true); setSaved(false);
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
          extra_senders:         JSON.stringify(cleaned),
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Помилка збереження', 'error'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { showToast('Помилка мережі', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <Mail size={18} color="#1E3A5F" />
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Пошта</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Email для відправки листів постачальникам та адмін-нотифікацій</div>
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
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Використовується як FROM при відправці замовлень постачальникам
            </div>
          </div>
        </div>

        {/* Додаткові відправники — можна обрати при відправці постачальнику */}
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Додаткові відправники</div>
            <button type="button"
              onClick={() => setExtraSenders(prev => [...prev, { name: '', email: '' }])}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '30px', padding: '0 10px', borderRadius: '7px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} /> Додати
            </button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
            Ці адреси можна обрати як відправника при надсиланні замовлень постачальникам.
            Домен адреси має бути верифікований у Resend — інакше лист не піде.
          </div>
          {extraSenders.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Немає додаткових адрес</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {extraSenders.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 34px', gap: '8px', alignItems: 'center' }}>
                  <input style={{ ...inp, height: '36px' }} value={s.name} placeholder="Ім'я (напр. Закупівлі)"
                    onChange={e => setExtraSenders(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <input style={{ ...inp, height: '36px' }} type="email" value={s.email} placeholder="zakupki@your-domain.com"
                    onChange={e => setExtraSenders(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                  <button type="button" title="Видалити"
                    onClick={() => setExtraSenders(prev => prev.filter((_, j) => j !== i))}
                    style={{ height: '36px', width: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '7px', border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label style={lbl}>Email адміністратора</label>
          <input style={{ ...inp, maxWidth: '320px' }} type="email" value={adminEmail}
            onChange={e => setAdminEmail(e.target.value)}
            placeholder="admin@fixline.com.ua" />
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Отримує копії листів та системні нотифікації
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Контактні дані компанії</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={lbl}>Контактна особа</label>
              <input style={inp} value={contactName} onChange={e => setContactName(e.target.value)}
                placeholder="Іван Іваненко" />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Відображається в листах постачальникам
              </div>
            </div>
            <div>
              <label style={lbl}>Телефон</label>
              <input style={inp} value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                placeholder="+380671234567" />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Для зворотного зв&apos;язку з постачальниками
              </div>
            </div>
          </div>
        </div>

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
