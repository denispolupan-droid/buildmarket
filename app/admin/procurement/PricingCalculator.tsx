'use client';

const inp: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '6px',
  fontSize: '12px', outline: 'none', padding: '4px 8px',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
  boxSizing: 'border-box',
};

type Props = {
  markupRetail:    number | '';
  markupWholesale: number | '';
  markupDrop:      number | '';
  onMarkupChange:  (field: 'retail' | 'wholesale' | 'drop', v: number | '') => void;
  onApply:         () => void;
  example?:        string;
};

export default function PricingCalculator({ markupRetail, markupWholesale, markupDrop, onMarkupChange, onApply, example }: Props) {
  const hasAny = markupRetail !== '' || markupWholesale !== '' || markupDrop !== '';

  const markupInput = (
    label: string,
    color: string,
    field: 'retail' | 'wholesale' | 'drop',
    value: number | '',
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color, flexShrink: 0, width: '16px' }}>{label}</span>
      <div style={{ position: 'relative', width: '70px' }}>
        <input
          type="number" min={0} max={10000} step={1}
          value={value}
          onChange={e => onMarkupChange(field, e.target.value !== '' ? parseFloat(e.target.value) : '')}
          onKeyDown={e => { if (e.key === 'Enter' && hasAny) onApply(); }}
          placeholder="—"
          style={{ ...inp, height: '30px', textAlign: 'right', paddingRight: '20px', width: '100%' }}
        />
        <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)', pointerEvents: 'none' }}>%</span>
      </div>
    </div>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 16px',
      background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '10px',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0, letterSpacing: '0.04em' }}>
        Наценка
      </span>

      {markupInput('Р', '#1E3A5F', 'retail',    markupRetail)}
      {markupInput('О', '#7C3AED', 'wholesale', markupWholesale)}
      {markupInput('Д', '#15803D', 'drop',      markupDrop)}

      <button
        onClick={onApply}
        disabled={!hasAny}
        style={{
          height: '30px', padding: '0 16px', borderRadius: '7px', border: 'none',
          background: hasAny ? '#1E3A5F' : '#CBD5E1',
          color: '#fff', fontSize: '12px', fontWeight: 700,
          cursor: hasAny ? 'pointer' : 'default',
          flexShrink: 0, transition: 'background 0.15s',
        }}
      >
        Розрахувати
      </button>

      {example && (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
          Напр.:&nbsp;<strong style={{ color: 'var(--text-primary)' }}>{example}</strong>
        </span>
      )}

      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto', fontStyle: 'italic', flexShrink: 0 }}>
        собів. × (1 + %)
      </span>
    </div>
  );
}
