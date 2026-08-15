import type { CSSProperties } from 'react';

// Спільні стилі екранів SEO. Кольори — тільки через CSS-змінні: у розділі був
// суцільний хардкод (#fff, #1E293B, #E2E8F0), і в темній темі текст зливався з
// підкладкою. Семантичні акценти (небезпека/увага/успіх) беремо з тих самих
// змінних, що фінанси, щоб адмінка виглядала одним продуктом.

export const card: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '16px 18px',
};

export const th: CSSProperties = {
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

export const td: CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--text-primary)',
  borderTop: '1px solid var(--border-light)',
  verticalAlign: 'top',
};

export const tdNum: CSSProperties = {
  ...td,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

export const path: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  color: 'var(--text-secondary)',
  maxWidth: 320,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  display: 'inline-block',
  verticalAlign: 'bottom',
};

export const hint: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  lineHeight: 1.5,
};

export const btnPrimary: CSSProperties = {
  padding: '8px 18px',
  background: 'var(--btn-teal-bg)',
  color: 'var(--btn-teal-text)',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

export const btnGhost: CSSProperties = {
  padding: '8px 14px',
  background: 'var(--bg-card)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--btn-ghost-border)',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

export const btnDanger: CSSProperties = { ...btnPrimary, background: 'var(--color-danger)' };

export function chip(active: boolean): CSSProperties {
  return {
    padding: '6px 13px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${active ? 'var(--brand-blue)' : 'var(--border)'}`,
    background: active ? 'var(--brand-blue)' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text-secondary)',
  };
}

/** Кольори серйозності — однакові в усіх екранах розділу. */
export const TONE = {
  danger: 'var(--color-danger)',
  warn: '#D97706',
  info: 'var(--brand-blue)',
  ok: 'var(--color-success)',
  muted: 'var(--text-muted)',
} as const;

export type Tone = keyof typeof TONE;

export function badge(tone: Tone): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: TONE[tone],
    background: 'transparent',
    border: `1px solid ${TONE[tone]}`,
    borderRadius: 5,
    padding: '1px 6px',
    whiteSpace: 'nowrap',
  };
}

export const num = (n: number, digits = 0) =>
  n.toLocaleString('uk-UA', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
