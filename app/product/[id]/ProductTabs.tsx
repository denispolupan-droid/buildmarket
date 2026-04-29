'use client';

import { useState } from 'react';

type Characteristic = { id: number; label: string; value: string };

type Props = {
  description: string | null;
  descriptionFull: string | null;
  characteristics: Characteristic[];
};

export default function ProductTabs({ description, descriptionFull, characteristics }: Props) {
  const displayDesc = descriptionFull || description;
  const [tab, setTab] = useState<'desc' | 'chars' | 'docs'>('desc');

  return (
    <div className="product-tabs">
      <div className="product-tabs__nav">
        <button
          className={'product-tabs__tab' + (tab === 'desc' ? ' is-active' : '')}
          onClick={() => setTab('desc')}
        >
          Опис
        </button>
        <button
          className={'product-tabs__tab' + (tab === 'chars' ? ' is-active' : '')}
          onClick={() => setTab('chars')}
        >
          Характеристики
        </button>
        <button
          className={'product-tabs__tab' + (tab === 'docs' ? ' is-active' : '')}
          onClick={() => setTab('docs')}
        >
          Документи
        </button>
      </div>

      <div className="product-tabs__content">
        {tab === 'desc' && (
          displayDesc
            ? <p className="product-tabs__desc">{displayDesc}</p>
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
