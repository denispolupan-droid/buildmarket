'use client';

import { useEffect, useState } from 'react';
import { Search, ClipboardCheck } from 'lucide-react';
import { showToast } from '../../../../lib/toast';
import { showConfirm } from '../../../../lib/confirm';

type Warehouse = { id: number; name: string; is_default: boolean };
type Item = { sku: string; name: string; plan: number; reserved: number; avg_cost: number };

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InventoryClient() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [items, setItems]     = useState<Item[] | null>(null);
  const [facts, setFacts]     = useState<Record<string, string>>({});
  const [search, setSearch]   = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [note, setNote]       = useState('');
  const [result, setResult]   = useState<{ doc_number: string; doc_id: string; diffs: number; surplus_cost: number; shortage_cost: number } | null>(null);

  useEffect(() => {
    fetch('/api/admin/accounting/inventory')
      .then(r => r.json())
      .then(d => {
        setWarehouses(d.warehouses ?? []);
        const def = (d.warehouses ?? []).find((w: Warehouse) => w.is_default) ?? (d.warehouses ?? [])[0];
        if (def) setWarehouseId(def.id);
      })
      .catch(() => showToast('Не вдалося завантажити склади', 'error'));
  }, []);

  async function loadItems() {
    if (warehouseId === '') return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/accounting/inventory?warehouse_id=${warehouseId}`);
      const d = await res.json();
      const rows: Item[] = d.items ?? [];
      setItems(rows);
      setFacts(Object.fromEntries(rows.map(i => [i.sku, String(i.plan)])));
    } catch {
      showToast('Помилка завантаження залишків', 'error');
    }
    setLoading(false);
  }

  const factOf = (sku: string) => {
    const v = parseFloat((facts[sku] ?? '').replace(',', '.'));
    return Number.isFinite(v) && v >= 0 ? v : null;
  };

  const diffs = (items ?? [])
    .map(i => ({ ...i, fact: factOf(i.sku), delta: (factOf(i.sku) ?? i.plan) - i.plan }))
    .filter(i => i.fact !== null && Math.abs(i.delta) > 1e-9);

  const surplus  = diffs.filter(d => d.delta > 0).reduce((s, d) => s + d.delta * d.avg_cost, 0);
  const shortage = diffs.filter(d => d.delta < 0).reduce((s, d) => s + Math.abs(d.delta) * d.avg_cost, 0);

  const visible = (items ?? []).filter(i => {
    if (search && !`${i.sku} ${i.name}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (onlyDiff) {
      const f = factOf(i.sku);
      return f !== null && Math.abs(f - i.plan) > 1e-9;
    }
    return true;
  });

  async function submit() {
    if (!items || warehouseId === '') return;
    const invalid = items.filter(i => factOf(i.sku) === null);
    if (invalid.length) { showToast(`Невірний факт: ${invalid[0].sku}`, 'error'); return; }
    if (!diffs.length) { showToast('Розбіжностей немає — документ не потрібен', 'info'); return; }

    const ok = await showConfirm(
      `Провести інвентаризацію? Розбіжностей: ${diffs.length} · надлишок ${fmt(surplus)} ₴ · нестача ${fmt(shortage)} ₴. Склад буде скориговано.`,
    );
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch('/api/admin/accounting/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse_id: warehouseId,
          note,
          lines: items.map(i => ({ sku: i.sku, fact: factOf(i.sku) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (data.no_diff) {
          showToast('Розбіжностей немає', 'info');
        } else {
          showToast(`Інвентаризацію проведено (${data.doc_number})`, 'success');
          setResult(data);
          loadItems();
        }
      } else {
        showToast(data.error ?? 'Помилка проведення', 'error');
      }
    } catch {
      showToast('Мережева помилка', 'error');
    }
    setSaving(false);
  }

  const inp: React.CSSProperties = {
    height: '34px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px',
    fontSize: '13px', outline: 'none', background: 'var(--bg-soft)', color: 'var(--text-primary)',
    boxSizing: 'border-box',
  };

  return (
    <div>
      {/* Панель вибору складу */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Склад</label>
          <select value={warehouseId} onChange={e => { setWarehouseId(e.target.value === '' ? '' : Number(e.target.value)); setItems(null); }}
            style={{ ...inp, cursor: 'pointer', minWidth: '220px' }}>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <button onClick={loadItems} disabled={loading || warehouseId === ''}
          style={{ height: '34px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Завантаження…' : items ? 'Оновити залишки' : 'Почати перерахунок'}
        </button>
        {items && (
          <>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук SKU / назви…"
                style={{ ...inp, paddingLeft: '30px', width: '220px' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', height: '34px' }}>
              <input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} />
              Тільки розбіжності
            </label>
          </>
        )}
      </div>

      {/* Результат проведення */}
      {result && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px', fontSize: '13px', color: 'var(--text-primary)' }}>
          ✅ Проведено документ <a href={`/admin/accounting/documents/${result.doc_id}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 800, color: '#15803D' }}>{result.doc_number}</a> —
          розбіжностей {result.diffs}, надлишок <strong>{fmt(result.surplus_cost)} ₴</strong>, нестача <strong>{fmt(result.shortage_cost)} ₴</strong>.
        </div>
      )}

      {/* Таблиця перерахунку */}
      {items && (
        <>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'auto', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-soft)', borderBottom: '2px solid var(--border)' }}>
                  {['Товар', 'Облік (план)', 'Факт', 'Різниця', 'Сума різниці'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 14px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {onlyDiff ? 'Розбіжностей немає' : 'Склад порожній'}
                  </td></tr>
                )}
                {visible.map(i => {
                  const f = factOf(i.sku);
                  const delta = f === null ? 0 : f - i.plan;
                  const hasDiff = f !== null && Math.abs(delta) > 1e-9;
                  return (
                    <tr key={i.sku} style={{ borderTop: '1px solid var(--border-light)', background: hasDiff ? (delta > 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)') : 'transparent' }}>
                      <td style={{ padding: '7px 14px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{i.sku}{i.reserved > 0 ? ` · резерв ${i.reserved}` : ''}</div>
                      </td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{i.plan}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                        <input
                          value={facts[i.sku] ?? ''}
                          onChange={e => setFacts(prev => ({ ...prev, [i.sku]: e.target.value }))}
                          inputMode="decimal"
                          style={{ ...inp, height: '30px', width: '80px', textAlign: 'right', fontWeight: 700, borderColor: f === null ? '#FCA5A5' : hasDiff ? (delta > 0 ? '#86EFAC' : '#FCA5A5') : 'var(--border)' }}
                        />
                      </td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: !hasDiff ? 'var(--text-muted)' : delta > 0 ? '#15803D' : '#DC2626' }}>
                        {f === null ? '?' : hasDiff ? (delta > 0 ? `+${delta}` : delta) : '—'}
                      </td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {hasDiff ? `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta) * i.avg_cost)} ₴` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Підсумок + проведення */}
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
              Розбіжностей: <strong>{diffs.length}</strong>
              {diffs.length > 0 && (
                <>
                  {' · '}надлишок <strong style={{ color: '#15803D' }}>+{fmt(surplus)} ₴</strong>
                  {' · '}нестача <strong style={{ color: '#DC2626' }}>−{fmt(shortage)} ₴</strong>
                </>
              )}
            </div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Коментар (необов'язково)"
              style={{ ...inp, flex: '1 1 200px' }} />
            <button onClick={submit} disabled={saving || !diffs.length}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '38px', padding: '0 20px', borderRadius: '9px', border: 'none', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving || !diffs.length ? 'default' : 'pointer', opacity: saving || !diffs.length ? 0.6 : 1 }}>
              <ClipboardCheck size={15} /> {saving ? 'Проводимо…' : 'Провести інвентаризацію'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
