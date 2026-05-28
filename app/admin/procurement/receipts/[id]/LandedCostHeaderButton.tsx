'use client';

import ReceiptLandedCostButton from '../../[id]/ReceiptLandedCostButton';

export default function LandedCostHeaderButton({
  receiptId,
  hasLC,
}: {
  receiptId: string;
  hasLC: boolean;
}) {
  return (
    <ReceiptLandedCostButton
      receiptId={receiptId}
      renderTrigger={onClick => (
        <button
          onClick={onClick}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            height: '34px', padding: '0 14px', borderRadius: '8px',
            border: '1.5px solid #DDD6FE',
            background: hasLC ? '#F5F3FF' : 'var(--bg-soft)',
            color: hasLC ? '#7C3AED' : 'var(--text-secondary)',
            fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          }}
        >
          📦 {hasLC ? 'Витрати (є)' : 'Додати витрати'}
        </button>
      )}
    />
  );
}
