'use client';

/**
 * Reusable inline pricing calculator strip.
 * Used identically in NewPOModal and NewReceiptModal.
 *
 * Layout: ЦІНА ПРОДАЖУ | Наценка [___]% | [Розрахувати] | Напр.: 100 → 130 ₴ | собів. × (1 + наценка%)
 */

const inp: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '6px',
  fontSize: '12px', outline: 'none', padding: '4px 8px',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
  width: '100%', boxSizing: 'border-box',
};

type Props = {
  markupPct:      number | '';
  onMarkupChange: (v: number | '') => void;
  onApply:        () => void;
  example?:       string;   // e.g. "435,00 → 501 ₴"
};

export default function PricingCalculator({ markupPct, onMarkupChange, onApply, example }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 16px',
      background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '10px',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0, letterSpacing: '0.04em' }}>
        Ціна продажу
      </span>

      {/* Markup % */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)', flexShrink: 0 }}>Наценка</label>
        <div style={{ position: 'relative', width: '80px' }}>
          <input
            type="number" min={0} max={10000} step={1}
            value={markupPct}
            onChange={e => onMarkupChange(e.target.value !== '' ? parseFloat(e.target.value) : '')}
            onKeyDown={e => { if (e.key === 'Enter' && markupPct !== '') onApply(); }}
            placeholder="30"
            style={{ ...inp, height: '30px', textAlign: 'right', paddingRight: '22px', width: '100%' }}
          />
          <span style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)', pointerEvents: 'none' }}>%</span>
        </div>
      </div>

      {/* Apply button */}
      <button
        onClick={onApply}
        disabled={markupPct === ''}
        style={{
          height: '30px', padding: '0 16px', borderRadius: '7px', border: 'none',
          background: markupPct !== '' ? '#1E3A5F' : '#CBD5E1',
          color: '#fff', fontSize: '12px', fontWeight: 700,
          cursor: markupPct !== '' ? 'pointer' : 'default',
          flexShrink: 0, transition: 'background 0.15s',
        }}
      >
        Розрахувати
      </button>

      {/* Live example */}
      {example && (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
          Напр.:&nbsp;<strong style={{ color: 'var(--text-primary)' }}>{example}</strong>
        </span>
      )}

      {/* Formula hint */}
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto', fontStyle: 'italic', flexShrink: 0 }}>
        собів. × (1 + наценка%)
      </span>
    </div>
  );
}
