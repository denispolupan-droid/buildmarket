'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

const inp: React.CSSProperties = {
  height: '42px', padding: '0 12px', border: '1.5px solid var(--border)', borderRadius: '10px',
  fontSize: '14px', outline: 'none', width: '100%', color: 'var(--text-primary)', background: 'var(--bg-card)',
  boxSizing: 'border-box',
};
const textarea: React.CSSProperties = {
  padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: '10px',
  fontSize: '14px', outline: 'none', width: '100%', color: 'var(--text-primary)', background: 'var(--bg-card)',
  boxSizing: 'border-box', resize: 'vertical', minHeight: '72px', lineHeight: 1.5,
};
const lbl: React.CSSProperties = {
  fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', display: 'block',
};
const hint: React.CSSProperties = {
  fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px',
};
const section: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: '14px', padding: '20px 24px',
  border: '1px solid var(--border)', marginBottom: '16px',
};
const sectionTitle: React.CSSProperties = {
  fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px',
};
const row: React.CSSProperties = { marginBottom: '14px' };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' };

type PromoConfig = {
  topBar: { emoji: string; label: string; discount: string; text: string; detail: string };
  banner: { active: boolean; tag: string; title: string; subtitle: string; ctaText: string; categorySlug: string; dismissKey: string };
};

export default function PromoSettings({ initial }: { initial: PromoConfig }) {
  const [cfg, setCfg] = useState<PromoConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setTop = (k: keyof PromoConfig['topBar'], v: string) =>
    setCfg(c => ({ ...c, topBar: { ...c.topBar, [k]: v } }));
  const setBanner = (k: keyof PromoConfig['banner'], v: string | boolean) =>
    setCfg(c => ({ ...c, banner: { ...c.banner, [k]: v } }));

  async function save() {
    setSaving(true); setSaved(false);
    const res = await fetch('/api/admin/promo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
  }

  return (
    <div>
      {/* ── Верхня полоса ────────────────────────────────── */}
      <div style={section}>
        <div style={sectionTitle}>☀️ Верхній рядок (на всіх сторінках)</div>

        {/* Preview */}
        <div style={{ background: '#243F63', borderRadius: '8px', padding: '6px 16px', textAlign: 'center', marginBottom: '16px', fontSize: '12px', fontWeight: 700, color: '#E2E8F0' }}>
          {cfg.topBar.emoji} {cfg.topBar.label} <span style={{ color: '#FCD34D' }}>{cfg.topBar.discount}</span> {cfg.topBar.text} {cfg.topBar.detail} {cfg.topBar.emoji}
        </div>

        <div style={grid2}>
          <div>
            <label style={lbl}>Назва акції</label>
            <input style={inp} value={cfg.topBar.label} onChange={e => setTop('label', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Знижка</label>
            <input style={inp} value={cfg.topBar.discount} onChange={e => setTop('discount', e.target.value)} placeholder="−10%" />
          </div>
        </div>
        <div style={row}>
          <label style={lbl}>Текст</label>
          <input style={inp} value={cfg.topBar.text} onChange={e => setTop('text', e.target.value)} placeholder="на герметики Ceresit" />
        </div>
        <div style={row}>
          <label style={lbl}>Деталь (термін)</label>
          <input style={inp} value={cfg.topBar.detail} onChange={e => setTop('detail', e.target.value)} placeholder="до кінця червня" />
        </div>
      </div>

      {/* ── Банер у каталозі / магазині ─────────────────── */}
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={sectionTitle}>🏷 Банер у магазині та каталозі</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div
              onClick={() => setBanner('active', !cfg.banner.active)}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', position: 'relative', cursor: 'pointer',
                background: cfg.banner.active ? '#22C55E' : '#CBD5E1', transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: '3px', left: cfg.banner.active ? '23px' : '3px',
                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: cfg.banner.active ? '#16A34A' : 'var(--text-muted)' }}>
              {cfg.banner.active ? 'Показується' : 'Сховано'}
            </span>
          </label>
        </div>

        {/* Banner preview */}
        {cfg.banner.active && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '18px' }}>☀️</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: '#FDE68A', color: '#92400E', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', textTransform: 'uppercase' }}>{cfg.banner.tag}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#78350F' }}>{cfg.banner.title}</span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#A16207' }}>{cfg.banner.subtitle}</p>
            </div>
            <span style={{ background: '#F59E0B', color: '#fff', fontSize: '11.5px', fontWeight: 700, padding: '5px 11px', borderRadius: '7px' }}>{cfg.banner.ctaText} →</span>
          </div>
        )}

        <div style={grid2}>
          <div>
            <label style={lbl}>Тег</label>
            <input style={inp} value={cfg.banner.tag} onChange={e => setBanner('tag', e.target.value)} placeholder="Літня акція" />
          </div>
          <div>
            <label style={lbl}>Кнопка CTA</label>
            <input style={inp} value={cfg.banner.ctaText} onChange={e => setBanner('ctaText', e.target.value)} placeholder="Переглянути герметики" />
          </div>
        </div>
        <div style={row}>
          <label style={lbl}>Заголовок банера</label>
          <input style={inp} value={cfg.banner.title} onChange={e => setBanner('title', e.target.value)} />
        </div>
        <div style={row}>
          <label style={lbl}>Підзаголовок</label>
          <textarea style={textarea} value={cfg.banner.subtitle} onChange={e => setBanner('subtitle', e.target.value)} />
        </div>
        <div style={grid2}>
          <div>
            <label style={lbl}>Категорія (slug)</label>
            <input style={inp} value={cfg.banner.categorySlug} onChange={e => setBanner('categorySlug', e.target.value)} placeholder="hermetyky" />
            <p style={hint}>Slug з URL ?category=...</p>
          </div>
          <div>
            <label style={lbl}>Ключ закриття</label>
            <input style={inp} value={cfg.banner.dismissKey} onChange={e => setBanner('dismissKey', e.target.value)} />
            <p style={hint}>Змініть при новій акції — банер знову з'явиться</p>
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={save}
        disabled={saving}
        style={{
          height: '44px', padding: '0 28px', borderRadius: '10px', border: 'none', cursor: saving ? 'default' : 'pointer',
          background: saved ? '#16A34A' : '#4880B8', color: '#fff', fontSize: '14px', fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s',
        }}
      >
        {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <Check size={16} /> : null}
        {saving ? 'Зберігаємо...' : saved ? 'Збережено!' : 'Зберегти зміни'}
      </button>
    </div>
  );
}
