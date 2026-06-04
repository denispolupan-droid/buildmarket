'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { type PromoConfig } from '../../promo.config';

/* ── Shared styles ─────────────────────────────────────────────────────────── */
const inp: React.CSSProperties = {
  height: '42px', padding: '0 12px', border: '1.5px solid var(--border)', borderRadius: '10px',
  fontSize: '14px', outline: 'none', width: '100%', color: 'var(--text-primary)',
  background: 'var(--bg-card)', boxSizing: 'border-box',
};
const textarea: React.CSSProperties = {
  padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: '10px',
  fontSize: '14px', outline: 'none', width: '100%', color: 'var(--text-primary)',
  background: 'var(--bg-card)', boxSizing: 'border-box', resize: 'vertical', minHeight: '72px',
};
const lbl: React.CSSProperties = {
  fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', display: 'block',
};
const hint: React.CSSProperties = { fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' };
const section: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '14px', padding: '20px 24px',
  border: '1px solid var(--border)', marginBottom: '16px',
};
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' };
const mb14: React.CSSProperties = { marginBottom: '14px' };

/* ── Color picker ──────────────────────────────────────────────────────────── */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={mb14}>
      <label style={lbl}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: '42px', height: '42px', padding: '3px', border: '1.5px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'none', flexShrink: 0 }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          maxLength={7} style={{ ...inp, width: '130px' }} placeholder="#FFFBEB" />
      </div>
    </div>
  );
}

/* ── Toggle ────────────────────────────────────────────────────────────────── */
function Toggle({ value, onChange, labelOn, labelOff }: { value: boolean; onChange: (v: boolean) => void; labelOn: string; labelOff: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
      <div onClick={() => onChange(!value)} style={{ width: '44px', height: '24px', borderRadius: '12px', position: 'relative', cursor: 'pointer', background: value ? '#22C55E' : '#CBD5E1', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: '3px', left: value ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: 600, color: value ? '#16A34A' : 'var(--text-muted)' }}>
        {value ? labelOn : labelOff}
      </span>
    </label>
  );
}

/* ── Size preset selector ──────────────────────────────────────────────────── */
const SIZES = [
  { value: 'compact', label: 'Компактний', desc: 'Менше відступи' },
  { value: 'medium',  label: 'Середній',   desc: 'За замовчуванням' },
  { value: 'large',   label: 'Великий',    desc: 'Більше відступи' },
] as const;

function SizeSelector({ value, onChange }: { value: string; onChange: (v: 'compact' | 'medium' | 'large') => void }) {
  return (
    <div style={mb14}>
      <label style={lbl}>Розмір банера</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        {SIZES.map(s => (
          <button key={s.value} onClick={() => onChange(s.value)}
            style={{ flex: 1, padding: '10px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', border: value === s.value ? '2px solid #4880B8' : '2px solid var(--border)', background: value === s.value ? '#EFF6FF' : 'var(--bg-card)', color: value === s.value ? '#4880B8' : 'var(--text-secondary)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.7 }}>{s.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────────── */
export default function PromoSettings({ initial }: { initial: PromoConfig }) {
  const [cfg, setCfg]   = useState<PromoConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const setTop    = <K extends keyof PromoConfig['topBar']>(k: K, v: PromoConfig['topBar'][K]) =>
    setCfg(c => ({ ...c, topBar: { ...c.topBar, [k]: v } }));
  const setBanner = <K extends keyof PromoConfig['banner']>(k: K, v: PromoConfig['banner'][K]) =>
    setCfg(c => ({ ...c, banner: { ...c.banner, [k]: v } }));

  async function save() {
    setSaving(true); setSaved(false);
    const res = await fetch('/api/admin/promo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
  }

  const { topBar, banner } = cfg;

  return (
    <div>
      {/* ── Верхня полоса ──────────────────────────────────────────────────── */}
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Верхній рядок (всі сторінки)</div>
          <Toggle value={topBar.visible} onChange={v => setTop('visible', v)} labelOn="Показується" labelOff="Сховано" />
        </div>

        {/* Live preview */}
        {topBar.visible && (
          <div style={{ background: topBar.bgColor, borderRadius: '8px', padding: '6px 16px', textAlign: 'center', marginBottom: '16px', fontSize: '12px', fontWeight: 700, color: '#E2E8F0' }}>
            {topBar.emoji} {topBar.label} <span style={{ color: '#FCD34D' }}>{topBar.discount}</span> {topBar.text} {topBar.detail} {topBar.emoji}
          </div>
        )}

        <div style={grid2}>
          <div>
            <label style={lbl}>Назва акції</label>
            <input style={inp} value={topBar.label} onChange={e => setTop('label', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Знижка</label>
            <input style={inp} value={topBar.discount} onChange={e => setTop('discount', e.target.value)} placeholder="−10%" />
          </div>
        </div>
        <div style={grid2}>
          <div>
            <label style={lbl}>Текст</label>
            <input style={inp} value={topBar.text} onChange={e => setTop('text', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Деталь (термін)</label>
            <input style={inp} value={topBar.detail} onChange={e => setTop('detail', e.target.value)} />
          </div>
        </div>
        <div style={grid2}>
          <div>
            <label style={lbl}>Емодзі</label>
            <input style={inp} value={topBar.emoji} onChange={e => setTop('emoji', e.target.value)} />
          </div>
          <ColorField label="Колір фону" value={topBar.bgColor} onChange={v => setTop('bgColor', v)} />
        </div>
      </div>

      {/* ── Банер у каталозі / магазині ────────────────────────────────────── */}
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Банер у магазині та каталозі</div>
          <Toggle value={banner.active} onChange={v => setBanner('active', v)} labelOn="Показується" labelOff="Сховано" />
        </div>

        {/* Live preview */}
        {banner.active && (
          <div style={{ background: banner.bgColor, border: `1px solid ${banner.borderColor}`, borderRadius: '10px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '18px' }}>{banner.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: banner.borderColor, color: banner.textColor, fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', textTransform: 'uppercase' }}>{banner.tag}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: banner.textColor }}>{banner.title}</span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: banner.textColor, opacity: 0.75 }}>{banner.subtitle}</p>
            </div>
            <span style={{ background: banner.ctaBgColor, color: '#fff', fontSize: '11.5px', fontWeight: 700, padding: '5px 11px', borderRadius: '7px' }}>{banner.ctaText} →</span>
          </div>
        )}

        <SizeSelector value={banner.size} onChange={v => setBanner('size', v)} />

        <div style={grid2}>
          <div>
            <label style={lbl}>Тег</label>
            <input style={inp} value={banner.tag} onChange={e => setBanner('tag', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Емодзі</label>
            <input style={inp} value={banner.emoji} onChange={e => setBanner('emoji', e.target.value)} />
          </div>
        </div>
        <div style={mb14}>
          <label style={lbl}>Заголовок</label>
          <input style={inp} value={banner.title} onChange={e => setBanner('title', e.target.value)} />
        </div>
        <div style={mb14}>
          <label style={lbl}>Підзаголовок</label>
          <textarea style={textarea} value={banner.subtitle} onChange={e => setBanner('subtitle', e.target.value)} />
        </div>
        <div style={grid2}>
          <div>
            <label style={lbl}>Кнопка CTA</label>
            <input style={inp} value={banner.ctaText} onChange={e => setBanner('ctaText', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Категорія (slug)</label>
            <input style={inp} value={banner.categorySlug} onChange={e => setBanner('categorySlug', e.target.value)} />
            <p style={hint}>URL: ?category=...</p>
          </div>
        </div>

        {/* Colors */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '4px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px' }}>Кольори</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <ColorField label="Фон банера" value={banner.bgColor} onChange={v => setBanner('bgColor', v)} />
            <ColorField label="Рамка / тег" value={banner.borderColor} onChange={v => setBanner('borderColor', v)} />
            <ColorField label="Колір тексту" value={banner.textColor} onChange={v => setBanner('textColor', v)} />
            <ColorField label="Кнопка CTA" value={banner.ctaBgColor} onChange={v => setBanner('ctaBgColor', v)} />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '4px' }}>
          <div style={mb14}>
            <label style={lbl}>Ключ закриття</label>
            <input style={inp} value={banner.dismissKey} onChange={e => setBanner('dismissKey', e.target.value)} />
            <p style={hint}>Змінюйте при новій акції — банер знову з&apos;явиться у відвідувачів</p>
          </div>
        </div>
      </div>

      {/* Save */}
      <button onClick={save} disabled={saving} style={{ height: '44px', padding: '0 28px', borderRadius: '10px', border: 'none', cursor: saving ? 'default' : 'pointer', background: saved ? '#16A34A' : '#4880B8', color: '#fff', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s' }}>
        {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <Check size={16} /> : null}
        {saving ? 'Зберігаємо...' : saved ? 'Збережено!' : 'Зберегти зміни'}
      </button>
    </div>
  );
}
