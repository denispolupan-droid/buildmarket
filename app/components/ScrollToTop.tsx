'use client';
import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Вгору"
      style={{
        position: 'fixed', bottom: '24px', right: '24px', zIndex: 50,
        width: '42px', height: '42px', borderRadius: '50%',
        background: '#4880B8', color: '#fff',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        transition: 'background 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#3B6EC4')}
      onMouseLeave={e => (e.currentTarget.style.background = '#4880B8')}
    >
      <ChevronUp size={20} strokeWidth={2.5} />
    </button>
  );
}
