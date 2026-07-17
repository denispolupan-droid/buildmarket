'use client';

import { useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { tFilterLabel, tFilterValue } from '../../../lib/translations-ru';

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
  const pathname = usePathname();
  const lang = pathname.startsWith('/ru') ? 'ru' : 'uk';
  const t = (uk: string, ru: string) => lang === 'ru' ? ru : uk;

  const displayDesc = descriptionFull || description;
  const [tab, setTab] = useState<'desc' | 'chars' | 'docs'>('desc');
  const tabsRef = useRef<HTMLDivElement>(null);

  function switchTab(next: 'desc' | 'chars' | 'docs') {
    setTab(next);
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
          {t('Опис', 'Описание')}
        </button>
        <button
          className={'product-tabs__tab' + (tab === 'chars' ? ' is-active' : '')}
          onClick={() => switchTab('chars')}
        >
          {t('Характеристики', 'Характеристики')}
        </button>
        <button
          className={'product-tabs__tab' + (tab === 'docs' ? ' is-active' : '')}
          onClick={() => switchTab('docs')}
        >
          {t('Документи', 'Документы')}
        </button>
      </div>

      {/* Усі панелі завжди в DOM (SEO: характеристики мають бути в initial HTML),
          неактивні ховаються через hidden */}
      <div className="product-tabs__content">
        <div hidden={tab !== 'desc'}>
          {displayDesc
            ? <div className="product-tabs__desc">
                {formatDescription(displayDesc).map((para, i, arr) => (
                  <p key={i} style={{ marginBottom: i < arr.length - 1 ? '12px' : 0 }}>
                    {para}
                  </p>
                ))}
              </div>
            : <p className="product-tabs__desc" style={{color:'var(--text-muted)'}}>{t('Опис відсутній', 'Описание отсутствует')}</p>}
        </div>

        <div hidden={tab !== 'chars'}>
          {characteristics.length > 0
            ? (
              <table className="chars-table">
                <tbody>
                  {characteristics.map((row) => (
                    <tr key={row.id}>
                      <td>{tFilterLabel(row.label, lang)}</td>
                      <td>{tFilterValue(row.value, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
            : <p className="product-tabs__desc" style={{color:'var(--text-muted)'}}>{t('Характеристики відсутні', 'Характеристики отсутствуют')}</p>}
        </div>

        <div hidden={tab !== 'docs'}>
          <p className="product-tabs__desc" style={{color:'var(--text-muted)'}}>
            {t('Документи поки що не завантажені', 'Документы пока не загружены')}
          </p>
        </div>
      </div>
    </div>
  );
}
