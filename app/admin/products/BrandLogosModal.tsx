'use client';

import { useRef, useState } from 'react';
import { X, Image as ImageIcon, Trash2, Upload } from 'lucide-react';

type Props = {
  brands: string[];
  logos: Record<string, string>; // brand name uppercase -> logo url
  onLogosChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onClose: () => void;
};

export default function BrandLogosModal({ brands, logos, onLogosChange, onClose }: Props) {
  const [busy, setBusy]       = useState<Record<string, boolean>>({});
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(brand: string, file: File) {
    const key = brand.toUpperCase();
    setBusy(b => ({ ...b, [brand]: true }));
    setErrors(e => ({ ...e, [brand]: '' }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('brand', brand);
      const res = await fetch('/api/admin/brand-logos', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Помилка завантаження');
      onLogosChange(prev => ({ ...prev, [key]: json.logoUrl }));
    } catch (err) {
      setErrors(e => ({ ...e, [brand]: err instanceof Error ? err.message : 'Помилка завантаження' }));
    } finally {
      setBusy(b => ({ ...b, [brand]: false }));
    }
  }

  async function remove(brand: string) {
    const key = brand.toUpperCase();
    setBusy(b => ({ ...b, [brand]: true }));
    try {
      const res = await fetch('/api/admin/brand-logos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand }),
      });
      if (!res.ok) throw new Error();
      onLogosChange(prev => { const n = { ...prev }; delete n[key]; return n; });
    } catch {
      setErrors(e => ({ ...e, [brand]: 'Не вдалося видалити' }));
    } finally {
      setBusy(b => ({ ...b, [brand]: false }));
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ImageIcon size={20} color="#3DBFB8" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>Логотипи брендів</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{brands.length} брендів у каталозі</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 24px 20px' }}>
          {brands.map(brand => {
            const key = brand.toUpperCase();
            const logoUrl = logos[key];
            const isBusy = busy[brand];
            return (
              <div key={brand} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{
                  width: 56, height: 40, borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
                }}>
                  {logoUrl
                    ? // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt={brand} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    : <ImageIcon size={16} color="#CBD5E1" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{brand}</div>
                  {errors[brand] && <div style={{ fontSize: 11, color: '#EF4444', marginTop: 2 }}>{errors[brand]}</div>}
                </div>
                <input
                  ref={el => { fileInputs.current[brand] = el; }}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) upload(brand, f); e.target.value = ''; }}
                />
                <button
                  disabled={isBusy}
                  onClick={() => fileInputs.current[brand]?.click()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 12px', borderRadius: 8,
                    border: '1px solid #CBD5E1', background: '#fff', color: '#334155',
                    fontSize: 12, fontWeight: 600, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.6 : 1,
                  }}
                >
                  <Upload size={13} /> {isBusy ? '...' : logoUrl ? 'Змінити' : 'Завантажити'}
                </button>
                {logoUrl && (
                  <button
                    disabled={isBusy}
                    onClick={() => remove(brand)}
                    aria-label="Видалити логотип"
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: '1px solid #FECACA', background: '#fff',
                      color: '#EF4444', cursor: isBusy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: isBusy ? 0.6 : 1,
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
