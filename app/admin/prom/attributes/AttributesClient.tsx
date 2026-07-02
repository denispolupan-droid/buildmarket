'use client';

import { useState } from 'react';

interface ImportedCategory {
  prom_category_id: number;
  attribute_count: number;
}

interface Props {
  imported: ImportedCategory[];
}

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '20px 24px',
  marginBottom: 20,
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px',
  background: '#7C3AED',
  color: '#fff',
  border: 'none',
  borderRadius: 7,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnDanger: React.CSSProperties = {
  padding: '4px 12px',
  background: 'transparent',
  color: '#EF4444',
  border: '1px solid #EF4444',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};

export default function AttributesClient({ imported: initialImported }: Props) {
  const [xml, setXml]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState<{ ok: boolean; text: string } | null>(null);
  const [imported, setImported] = useState<ImportedCategory[]>(initialImported);

  async function handleImport() {
    if (!xml.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/prom/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml: xml.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? 'Помилка імпорту' });
      } else {
        const charsPart = data.charsAdded > 0
          ? `, заповнено ${data.charsAdded} характеристик у ${data.productsUpdated} товарів`
          : '';
        setMessage({ ok: true, text: `Імпортовано: ${data.categories} кат., ${data.attributes} атрибутів, ${data.values} значень${charsPart}` });
        setXml('');
        // Refresh list
        const listRes = await fetch('/api/admin/prom/attributes');
        const listData = await listRes.json();
        setImported(listData.categories ?? []);
      }
    } catch {
      setMessage({ ok: false, text: 'Мережева помилка' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(catId: number) {
    if (!confirm(`Видалити атрибути категорії ${catId}?`)) return;
    await fetch(`/api/admin/prom/attributes?category=${catId}`, { method: 'DELETE' });
    setImported(prev => prev.filter(c => c.prom_category_id !== catId));
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860 }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>
        Атрибути категорій Прома
      </h2>

      {/* Import block */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Імпорт XML</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Вставте XML атрибутів категорії (формат <code>&lt;categories&gt;&lt;category id="..."&gt;...&lt;/category&gt;&lt;/categories&gt;</code>).
          Можна вставити одразу кілька категорій.
        </div>
        <span style={label}>XML від Прома</span>
        <textarea
          value={xml}
          onChange={e => setXml(e.target.value)}
          rows={10}
          placeholder='<categories><category id="82210" nameUK="Герметики і силікони">...</category></categories>'
          style={{
            width: '100%',
            padding: '10px 12px',
            fontFamily: 'monospace',
            fontSize: 12,
            border: '1px solid var(--border)',
            borderRadius: 7,
            background: 'var(--bg)',
            color: 'var(--text)',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            style={{ ...btnPrimary, opacity: loading || !xml.trim() ? 0.6 : 1 }}
            disabled={loading || !xml.trim()}
            onClick={handleImport}
          >
            {loading ? 'Імпортується…' : 'Імпортувати'}
          </button>
          {message && (
            <span style={{ fontSize: 13, color: message.ok ? '#16A34A' : '#EF4444' }}>
              {message.text}
            </span>
          )}
        </div>
      </div>

      {/* Imported categories list */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 14 }}>
          Завантажені категорії ({imported.length})
        </div>
        {imported.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Поки що нічого не імпортовано
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Prom category ID</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Атрибутів</th>
                <th style={{ padding: '6px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {imported.map(c => (
                <tr key={c.prom_category_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 8px', fontWeight: 600 }}>{c.prom_category_id}</td>
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {c.attribute_count}
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                    <button style={btnDanger} onClick={() => handleDelete(c.prom_category_id)}>
                      Видалити
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <strong>Де взяти XML?</strong> На сайті Прома в кабінеті відкрийте категорію товару
        → «Характеристики» → в адресному рядку додайте <code>?format=xml</code>, або
        зверніться до документації API Прома.
      </div>
    </div>
  );
}
