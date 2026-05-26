'use client';

export default function NewOrderButton() {
  function handleClick() {
    window.dispatchEvent(new CustomEvent('open-order-draft'));
  }

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        height: '36px', padding: '0 18px', borderRadius: '9px',
        background: 'linear-gradient(135deg, #162035 0%, #1E3A5F 100%)',
        color: '#fff',
        fontSize: '13px', fontWeight: 700,
        border: 'none', cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
      }}
    >
      + Нове замовлення
    </button>
  );
}
