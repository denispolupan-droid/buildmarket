'use client';

import { useState, useRef } from 'react';

type Characteristic = { id: number; label: string; value: string };

type Props = {
  description: string | null;
  descriptionFull: string | null;
  characteristics: Characteristic[];
};

function formatDescription(text: string): string[] {
  // Розбиваємо на речення і групуємо по 2-3 в абзац
  const sentences = text
    .replace(/([.!?])\s+([А-ЯІЇЄA-Z])/g, '$1\n$2')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(' '));
  }
  return paragraphs;
}

export default function ProductTabs({ description, descriptionFull, characteristics }: Props) {
  const displayDesc = descriptionFull || description;
  const [tab, setTab] = useState<'desc' | 'chars' | 'docs'>('desc');
  const tabsRef = useRef<HTMLDivElement>(null);

  function switchTab(t: 'desc' | 'chars' | 'docs') {
    setTab(t);
    setTimeout(() => {
      if (!tabsRef.current) return;
      const header = document.querySelector('header') ?? document.querySelector('nav');
      const headerH = header ? header.getBoundingClientRect().height : 72;
      const top = tabsRef.current.getBoundingClientRect().top + window.scrollY - headerH - 16;
      window.scrollTo({ top, behavior: 'smooth' });
    }, 50);
  }

  return (
    <div className="product-tabs" ref={tabsRef}>
      <div className="product-tabs__nav">
        <button
          className={'product-tabs__tab' + (tab === 'desc' ? ' is-active' : '')}
          onClick={() => switchTab('desc')}
        >
          Опис
        </button>
        <button
          className={'product-tabs__tab' + (tab === 'chars' ? ' is-active' : '')}
          onClick={() => switchTab('chars')}
        >
          Характеристики
        </button>
        <button
          className={'product-tabs__tab' + (tab === 'docs' ? ' is-active' : '')}
          onClick={() => switchTab('docs')}
        >
          Документи
        </button>
      </div>

      <div className="product-tabs__content">
        {tab === 'desc' && (
          displayDesc
            ? <div className="product-tabs__desc">
                {formatDescription(displayDesc).map((para, i) => (
                  <p key={i} style={{ marginBottom: i < formatDescription(displayDesc).length - 1 ? '12px' : 0 }}>
                    {para}
                  </p>
                ))}
              </div>
            : <p className="product-tabs__desc" style={{color:'var(--text-muted)'}}>Опис відсутній</p>
        )}

        {tab === 'chars' && (
          characteristics.length > 0
            ? (
              <table className="chars-table">
                <tbody>
                  {characteristics.map((row) => (
                    <tr key={row.id}>
                      <td>{row.label}</td>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
            : <p className="product-tabs__desc" style={{color:'var(--text-muted)'}}>Характеристики відсутні</p>
        )}

        {tab === 'docs' && (
          <p className="product-tabs__desc" style={{color:'var(--text-muted)'}}>
            Документи поки що не завантажені
          </p>
        )}
      </div>
    </div>
  );
}
