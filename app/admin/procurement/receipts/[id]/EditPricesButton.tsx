'use client';

import { useState, useRef, useCallback } from 'react';
import { Pencil, X, Check, Upload, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

type PriceLine = {
  sku: string;
  name: string;
  qty: number;
  base_price: number;
  final_price: number;
};

type MatchResult = { sku: string; found: boolean; filePrice?: number; via?: 'sku' | 'name' };

// Normalize SKU for comparison: lowercase, remove dashes/spaces/dots
function normSku(s: string) {
  return String(s).toLowerCase().replace(/[\s\-_.]/g, '');
}

// Try to extract price number from a cell value
function toPrice(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.,]/g, '').replace(',', '.'));
  return isNaN(n) || n <= 0 ? null : n;
}

// Name similarity: ratio of overlapping significant words
function nameSimilarity(a: string, b: string): number {
  const sig = (s: string) => s.toLowerCase().split(/[\s,./()]+/).filter(w => w.length > 3);
  const wa = sig(a);
  const wb = sig(b);
  if (!wa.length || !wb.length) return 0;
  const overlap = wa.filter(w => wb.some(x => x.includes(w) || w.includes(x))).length;
  return overlap / Math.max(wa.length, wb.length);
}

type FileParsed = {
  skuMap:  Map<string, number>;           // normSku → price
  nameMap: Map<string, { price: number; rawName: string }>; // normName word key → price
  rows:    { sku: string; name: string; price: number }[];
};

// Parse file → structured data for SKU + name matching
function parseFile(file: File): Promise<FileParsed> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const SKU_KEYWORDS   = ['sku', 'артикул', 'article', 'код', 'code', 'арт'];
        const PRICE_KEYWORDS = ['ціна', 'цена', 'price', 'прайс', 'cost'];
        const NAME_KEYWORDS  = ['товар', 'назва', 'найменування', 'наименование', 'name', 'номенклатура'];

        let skuCol   = -1;
        let priceCol = -1;
        let nameCol  = -1;
        let dataStart = 0;

        // Scan up to 25 rows for header
        for (let r = 0; r < Math.min(rows.length, 25); r++) {
          const row = rows[r];
          for (let c = 0; c < row.length; c++) {
            const cell = String(row[c]).toLowerCase().trim();
            if (skuCol   === -1 && SKU_KEYWORDS.some(k => cell === k))   skuCol   = c;
            if (priceCol === -1 && PRICE_KEYWORDS.some(k => cell === k)) priceCol = c;
            if (nameCol  === -1 && NAME_KEYWORDS.some(k => cell === k))  nameCol  = c;
          }
          if (skuCol !== -1 && priceCol !== -1) { dataStart = r + 1; break; }
        }

        // Fallback: no header → col 0 = sku, last col = price
        if (skuCol === -1 || priceCol === -1) {
          skuCol   = 0;
          priceCol = Math.max(0, (rows.find(r => r.length > 1)?.length ?? 2) - 1);
          dataStart = 0;
        }

        const skuMap  = new Map<string, number>();
        const nameMap = new Map<string, { price: number; rawName: string }>();
        const parsed: FileParsed['rows'] = [];

        for (let r = dataStart; r < rows.length; r++) {
          const row = rows[r];
          const price = toPrice(row[priceCol]);
          if (price === null) continue;
          const rawSku  = String(row[skuCol]  ?? '').trim();
          const rawName = String(nameCol >= 0 ? (row[nameCol] ?? '') : '').trim();
          if (!rawSku && !rawName) continue;
          if (rawSku)  skuMap.set(normSku(rawSku), price);
          if (rawName) nameMap.set(rawName.toLowerCase(), { price, rawName });
          parsed.push({ sku: rawSku, name: rawName, price });
        }

        resolve({ skuMap, nameMap, rows: parsed });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export default function EditPricesButton({
  documentId,
  lines,
  hasLC,
}: {
  documentId: string;
  lines: PriceLine[];
  hasLC: boolean;
}) {
  const [open,    setOpen]    = useState(false);
  const [prices,  setPrices]  = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map(l => [l.sku, String(l.base_price)])),
  );
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [dragging, setDragging] = useState(false);
  const [parsing,  setParsing]  = useState(false);
  const [matches,  setMatches]  = useState<MatchResult[] | null>(null);
  // Per-SKU promo calculator: { paidQty, bonusQty }
  const [promoCalc, setPromoCalc] = useState<Record<string, { paidQty: string; bonusQty: string } | null>>({});

  function openPromo(sku: string, totalQty: number) {
    setPromoCalc(p => ({
      ...p,
      [sku]: p[sku] ?? { paidQty: String(totalQty - 1), bonusQty: '1' },
    }));
  }
  function closePromo(sku: string) {
    setPromoCalc(p => ({ ...p, [sku]: null }));
  }
  function applyPromo(sku: string, totalQty: number) {
    const calc = promoCalc[sku];
    if (!calc) return;
    const paid  = parseFloat(calc.paidQty);
    const bonus = parseFloat(calc.bonusQty);
    const price = parseFloat(prices[sku] ?? '0');
    if (!isNaN(paid) && !isNaN(bonus) && !isNaN(price) && (paid + bonus) === totalQty && totalQty > 0) {
      const avg = (paid * price) / totalQty;
      setPrices(p => ({ ...p, [sku]: String(Math.round(avg * 10000) / 10000) }));
    }
    closePromo(sku);
  }
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setParsing(true);
    setMatches(null);
    setError('');
    try {
      const parsed = await parseFile(file);
      const results: MatchResult[] = lines.map(l => {
        // 1. Try exact SKU match
        const price = parsed.skuMap.get(normSku(l.sku));
        if (price !== undefined) return { sku: l.sku, found: true, filePrice: price, via: 'sku' };

        // 2. Fallback: name similarity match
        let bestScore = 0;
        let bestPrice: number | undefined;
        for (const row of parsed.rows) {
          if (!row.name || !row.price) continue;
          const score = nameSimilarity(l.name, row.name);
          if (score > bestScore) { bestScore = score; bestPrice = row.price; }
        }
        if (bestScore >= 0.5 && bestPrice !== undefined) {
          return { sku: l.sku, found: true, filePrice: bestPrice, via: 'name' };
        }

        return { sku: l.sku, found: false };
      });
      const updated: Record<string, string> = { ...prices };
      for (const r of results) {
        if (r.found && r.filePrice !== undefined) updated[r.sku] = String(r.filePrice);
      }
      setPrices(updated);
      setMatches(results);
    } catch {
      setError('Не вдалося прочитати файл. Перевірте формат (Excel або CSV).');
    } finally {
      setParsing(false);
    }
  }, [lines, prices]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = lines.map(l => ({
        sku: l.sku,
        cost_price: parseFloat(prices[l.sku] ?? String(l.base_price)),
      })).filter(l => !isNaN(l.cost_price) && l.cost_price >= 0);

      const res = await fetch('/api/admin/accounting/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_prices', document_id: documentId, lines: updated }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      window.location.reload();
    } catch { setError('Мережева помилка'); }
    finally { setSaving(false); }
  }

  const matchedCount = matches?.filter(m => m.found).length ?? 0;
  const unmatchedCount = matches ? matches.length - matchedCount : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          height: '34px', padding: '0 14px', borderRadius: '8px',
          border: '1.5px solid #93C5FD', background: '#EFF6FF',
          color: '#1D4ED8', fontSize: '12px', fontWeight: 700,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Pencil size={13} /> Редагувати ціни
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '14px',
            padding: '24px', width: '620px', maxWidth: '95vw',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Редагувати ціни
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {hasLC
                    ? 'Введіть базову ціну без доп. витрат — LC буде перерозподілено автоматично'
                    : 'Зміна оновить собівартість у документі та FIFO-партії'}
                </p>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? '#3B82F6' : 'var(--border)'}`,
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '16px',
                background: dragging ? '#EFF6FF' : 'var(--bg-soft, #F8FAFC)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '12px',
                transition: 'all 0.15s',
              }}
            >
              <Upload size={18} style={{ color: dragging ? '#3B82F6' : 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {parsing ? 'Читання файлу...' : 'Прайс від постачальника'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Перетягніть Excel або CSV — ціни підставляться автоматично по SKU
                </div>
              </div>
              {matches && (
                <div style={{ fontSize: '12px', textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ color: '#15803D', fontWeight: 700 }}>✓ {matchedCount} знайдено</span>
                  {unmatchedCount > 0 && (
                    <span style={{ color: '#DC2626', fontWeight: 600, marginLeft: '8px' }}>✗ {unmatchedCount} не знайдено</span>
                  )}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.ods"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />

            {/* Unmatched warning */}
            {matches && unmatchedCount > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: '#92400E' }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  Не знайдено у файлі:{' '}
                  {matches.filter(m => !m.found).map(m => m.sku).join(', ')}.
                  Ціни залишились незмінними.
                </span>
              </div>
            )}

            {/* Price table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Позиція</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>К-сть</th>
                  {hasLC && (
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>З LC</th>
                  )}
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {hasLC ? 'База (без LC)' : 'Ціна / од.'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => {
                  const match = matches?.find(m => m.sku === l.sku);
                  const wasMatched = match?.found;
                  const promo = promoCalc[l.sku];
                  return (
                    <tr key={l.sku} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 8px', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                        <div style={{ fontWeight: 600 }}>{l.name || l.sku}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {l.sku}
                          {match?.via === 'name' && (
                            <span style={{ marginLeft: '6px', color: '#D97706', fontWeight: 600 }}>≈ по назві</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {l.qty}
                      </td>
                      {hasLC && (
                        <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px' }}>
                          {l.final_price.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      )}
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={prices[l.sku] ?? ''}
                            onChange={e => setPrices(p => ({ ...p, [l.sku]: e.target.value }))}
                            style={{
                              width: '100px', textAlign: 'right',
                              padding: '4px 8px', borderRadius: '6px',
                              border: `1.5px solid ${wasMatched ? '#86EFAC' : 'var(--border)'}`,
                              background: wasMatched ? '#F0FDF4' : 'var(--bg-input, #fff)',
                              fontSize: '13px', fontWeight: 600,
                              color: 'var(--text-primary)',
                            }}
                          />
                          <button
                            title="Є безкоштовні одиниці (акція)"
                            onClick={() => promo ? closePromo(l.sku) : openPromo(l.sku, l.qty)}
                            style={{
                              width: '24px', height: '24px', borderRadius: '5px', flexShrink: 0,
                              border: `1px solid ${promo ? '#FCD34D' : 'var(--border)'}`,
                              background: promo ? '#FFFBEB' : 'none',
                              color: promo ? '#D97706' : 'var(--text-muted)',
                              fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >%</button>
                        </div>

                        {/* Promo calculator */}
                        {promo && (
                          <div style={{
                            marginTop: '6px', padding: '8px 10px',
                            background: '#FFFBEB', border: '1px solid #FCD34D',
                            borderRadius: '8px', fontSize: '12px',
                          }}>
                            <div style={{ color: '#92400E', fontWeight: 600, marginBottom: '6px' }}>
                              Платних + безкоштовних = {l.qty}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input
                                type="number" min="0" step="1"
                                placeholder="платних"
                                value={promo.paidQty}
                                onChange={e => setPromoCalc(p => ({ ...p, [l.sku]: { ...p[l.sku]!, paidQty: e.target.value } }))}
                                style={{ width: '60px', padding: '3px 6px', borderRadius: '5px', border: '1px solid #FCD34D', fontSize: '12px', textAlign: 'center' }}
                              />
                              <span style={{ color: '#92400E' }}>+</span>
                              <input
                                type="number" min="0" step="1"
                                placeholder="безкошт."
                                value={promo.bonusQty}
                                onChange={e => setPromoCalc(p => ({ ...p, [l.sku]: { ...p[l.sku]!, bonusQty: e.target.value } }))}
                                style={{ width: '60px', padding: '3px 6px', borderRadius: '5px', border: '1px solid #FCD34D', fontSize: '12px', textAlign: 'center' }}
                              />
                              <button
                                onClick={() => applyPromo(l.sku, l.qty)}
                                style={{ padding: '3px 8px', borderRadius: '5px', border: 'none', background: '#D97706', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                              >
                                = середня
                              </button>
                            </div>
                            {(() => {
                              const paid  = parseFloat(promo.paidQty);
                              const bonus = parseFloat(promo.bonusQty);
                              const price = parseFloat(prices[l.sku] ?? '0');
                              if (!isNaN(paid) && !isNaN(bonus) && !isNaN(price) && paid + bonus === l.qty) {
                                const avg = (paid * price) / l.qty;
                                return <div style={{ marginTop: '4px', color: '#92400E', fontWeight: 600 }}>→ {Math.round(avg * 100) / 100} грн/шт</div>;
                              }
                              return null;
                            })()}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {error && (
              <div style={{ marginTop: '12px', padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '13px', color: '#DC2626', fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setOpen(false)}
                style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                Скасувати
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ height: '36px', padding: '0 18px', borderRadius: '8px', border: 'none', background: saving ? '#94A3B8' : '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Check size={14} /> {saving ? 'Збереження...' : 'Зберегти'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
