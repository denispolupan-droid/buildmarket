'use client';

import { useState } from 'react';
import { Tag, Trash2, Check, X, Edit2 } from 'lucide-react';

type PromoCode = {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_discount_amount: number | null;
  min_order_amount: number | null;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  description: string | null;
  created_at: string;
};

type FormState = {
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: string;
  max_discount_amount: string;
  min_order_amount: string;
  max_uses: string;
  valid_from: string;
  valid_until: string;
  description: string;
};

const emptyForm: FormState = {
  code: '', discount_type: 'percent', discount_value: '',
  max_discount_amount: '', min_order_amount: '0',
  max_uses: '', valid_from: '', valid_until: '', description: '',
};

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '14px', padding: '20px',
};
const inp: React.CSSProperties = {
  width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px',
  border: '1px solid var(--border)', background: 'var(--bg-soft)',
  color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
  boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
  marginBottom: '4px', display: 'block',
};
function btnStyle(primary?: boolean): React.CSSProperties {
  return {
    height: '36px', padding: '0 16px', borderRadius: '8px', border: 'none',
    cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    background: primary ? 'var(--brand-main)' : 'var(--bg-soft)',
    color: primary ? '#fff' : 'var(--text-primary)',
  };
}

export default function PromoCodesClient({ initial }: { initial: PromoCode[] }) {
  const [codes, setCodes]       = useState(initial);
  const [form, setForm]         = useState<FormState>(emptyForm);
  const [editing, setEditing]   = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  function setF(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [key]: key === 'code' ? e.target.value.toUpperCase() : e.target.value }));
  }

  async function handleSave() {
    if (!form.code.trim())                                               { setError('Вкажіть код'); return; }
    if (!form.discount_value || Number(form.discount_value) <= 0)        { setError('Вкажіть знижку'); return; }
    if (form.discount_type === 'percent' && Number(form.discount_value) > 100) { setError('Відсоток не може бути > 100'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        code:                form.code.trim(),
        discount_type:       form.discount_type,
        discount_value:      Number(form.discount_value),
        max_discount_amount: form.max_discount_amount ? Number(form.max_discount_amount) : null,
        min_order_amount:    Number(form.min_order_amount) || 0,
        max_uses:            form.max_uses ? Number(form.max_uses) : null,
        valid_from:          form.valid_from || null,
        valid_until:         form.valid_until || null,
        description:         form.description || null,
        ...(editing ? { id: editing } : {}),
      };
      const res = await fetch('/api/admin/promo-codes', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const saved: PromoCode = await res.json();
      setCodes(prev => editing ? prev.map(c => c.id === editing ? saved : c) : [saved, ...prev]);
      setForm(emptyForm); setEditing(null); setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, val: boolean) {
    const res = await fetch('/api/admin/promo-codes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: val }),
    });
    if (res.ok) { const saved = await res.json(); setCodes(prev => prev.map(c => c.id === id ? saved : c)); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Видалити промокод?')) return;
    const res = await fetch(`/api/admin/promo-codes?id=${id}`, { method: 'DELETE' });
    if (res.ok) setCodes(prev => prev.filter(c => c.id !== id));
  }

  function startEdit(c: PromoCode) {
    setForm({
      code:                c.code,
      discount_type:       c.discount_type,
      discount_value:      String(c.discount_value),
      max_discount_amount: c.max_discount_amount ? String(c.max_discount_amount) : '',
      min_order_amount:    String(c.min_order_amount ?? 0),
      max_uses:            c.max_uses ? String(c.max_uses) : '',
      valid_from:          c.valid_from ? c.valid_from.slice(0, 10) : '',
      valid_until:         c.valid_until ? c.valid_until.slice(0, 10) : '',
      description:         c.description ?? '',
    });
    setEditing(c.id); setShowForm(true); setError('');
  }

  function cancelForm() { setShowForm(false); setEditing(null); setForm(emptyForm); setError(''); }

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Tag size={20} /> Промокоди
        </h1>
        <button style={btnStyle(true)} onClick={() => {
          if (showForm && !editing) cancelForm();
          else { setShowForm(true); setEditing(null); setForm(emptyForm); setError(''); }
        }}>
          {showForm && !editing ? 'Скасувати' : '+ Новий промокод'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={card}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
            {editing ? 'Редагувати промокод' : 'Новий промокод'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <span style={lbl}>Код *</span>
              <input style={{ ...inp, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em' }}
                value={form.code} onChange={setF('code')} placeholder="SUMMER20" />
            </div>
            <div>
              <span style={lbl}>Тип знижки *</span>
              <select style={inp} value={form.discount_type} onChange={setF('discount_type')}>
                <option value="percent">Відсоток (%)</option>
                <option value="fixed">Фіксована сума (₴)</option>
              </select>
            </div>
            <div>
              <span style={lbl}>Розмір знижки *</span>
              <input style={inp} type="number" min="0.01" step="0.01"
                max={form.discount_type === 'percent' ? 100 : undefined}
                value={form.discount_value} onChange={setF('discount_value')}
                placeholder={form.discount_type === 'percent' ? '10' : '200'} />
            </div>
            {form.discount_type === 'percent' && (
              <div>
                <span style={lbl}>Макс. знижка (₴, необов&apos;язково)</span>
                <input style={inp} type="number" min="0" step="1"
                  value={form.max_discount_amount} onChange={setF('max_discount_amount')} placeholder="Без обмежень" />
              </div>
            )}
            <div>
              <span style={lbl}>Мін. сума замовлення (₴)</span>
              <input style={inp} type="number" min="0" step="1"
                value={form.min_order_amount} onChange={setF('min_order_amount')} placeholder="0" />
            </div>
            <div>
              <span style={lbl}>Ліміт застосувань</span>
              <input style={inp} type="number" min="1" step="1"
                value={form.max_uses} onChange={setF('max_uses')} placeholder="Без ліміту" />
            </div>
            <div>
              <span style={lbl}>Діє з</span>
              <input style={inp} type="date" value={form.valid_from} onChange={setF('valid_from')} />
            </div>
            <div>
              <span style={lbl}>Діє до (включно)</span>
              <input style={inp} type="date" value={form.valid_until} onChange={setF('valid_until')} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <span style={lbl}>Опис (для внутрішнього використання)</span>
              <input style={inp} value={form.description} onChange={setF('description')}
                placeholder="Напр.: промо для партнерів лютого 2026" />
            </div>
          </div>
          {error && <div style={{ color: '#EF4444', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button style={btnStyle(true)} onClick={handleSave} disabled={saving}>
              {saving ? '...' : editing ? 'Зберегти' : 'Створити'}
            </button>
            <button style={btnStyle()} onClick={cancelForm}>Скасувати</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={card}>
        {codes.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0', fontSize: '14px' }}>
            Промокодів ще немає. Натисніть «+ Новий промокод» щоб створити перший.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '680px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Код', 'Знижка', 'Мін. сума', 'Використань', 'Діє до', 'Опис', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', opacity: c.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '10px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                      {c.code}
                    </td>
                    <td style={{ padding: '10px', color: '#15803D', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {c.discount_type === 'percent'
                        ? `${c.discount_value}%${c.max_discount_amount ? ` (макс ${c.max_discount_amount} ₴)` : ''}`
                        : `${c.discount_value} ₴`}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {c.min_order_amount ? `${c.min_order_amount} ₴` : '—'}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {c.uses_count}{c.max_uses != null ? ` / ${c.max_uses}` : ''}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {c.valid_until ? new Date(c.valid_until).toLocaleDateString('uk-UA') : '—'}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.description ?? '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button onClick={() => toggleActive(c.id, !c.is_active)}
                          title={c.is_active ? 'Деактивувати' : 'Активувати'}
                          style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.is_active ? '#DCFCE7' : 'var(--bg-soft)', color: c.is_active ? '#15803D' : 'var(--text-muted)' }}
                        >{c.is_active ? <Check size={13} /> : <X size={13} />}</button>
                        <button onClick={() => startEdit(c)} title="Редагувати"
                          style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-soft)', color: 'var(--text-secondary)' }}
                        ><Edit2 size={13} /></button>
                        <button onClick={() => handleDelete(c.id)} title="Видалити"
                          style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FEE2E2', color: '#EF4444' }}
                        ><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
