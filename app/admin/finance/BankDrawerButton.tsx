'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Check, Zap, AlertCircle, Landmark } from 'lucide-react';

type Contract = {
  id: string; contract_number: string;
  customer_id: string; customer_name: string | null; balance?: number;
};
type ParsedTxn = {
  id: string; date: string; amount: number;
  description: string; counterparty?: string;
  confidence: 'auto' | 'suggested' | 'none';
  matchReason?: string; contractId: string;
  saving?: boolean; saved?: boolean; error?: string;
};

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const CONTRACT_RE = /[Дд][Гг]-?\d{4}-[A-Za-z0-9]{6,}/g;

function splitCSVLine(line: string, delim: string): string[] {
  const result: string[] = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; cur += ch; }
    else if (ch === delim && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur); return result;
}

function parseDate(raw: string): string | null {
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

function parseCSV(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map(h => h.replace(/"/g, '').toLowerCase().trim());
  const col = (keys: string[]) => { for (const k of keys) { const i = headers.findIndex(h => h.includes(k)); if (i >= 0) return i; } return -1; };
  const dateIdx = col(['дата і час','дата операц','date']);
  const amtIdx  = col(['сума в валюті картки','сума операц','сума','amount']);
  const descIdx = col(['деталі операції','призначення','description']);
  const cpIdx   = col(['назва контрагента','назва платника','counterparty']);

  return lines.slice(1).map((line, i) => {
    const cols = splitCSVLine(line, delim);
    const rawAmt = amtIdx >= 0 ? cols[amtIdx]?.replace(/["\s]/g,'').replace(',','.') : '';
    const amount = parseFloat(rawAmt);
    if (isNaN(amount) || amount <= 0) return null;
    const date = parseDate(dateIdx >= 0 ? cols[dateIdx]?.replace(/"/g,'').trim() : '');
    if (!date) return null;
    return {
      id: `${i}_${amount}_${date}`,
      date, amount,
      description: descIdx >= 0 ? cols[descIdx]?.replace(/"/g,'').trim() : '',
      counterparty: cpIdx >= 0 ? cols[cpIdx]?.replace(/"/g,'').trim() : undefined,
    };
  }).filter(Boolean) as { id: string; date: string; amount: number; description: string; counterparty?: string }[];
}

function autoMatch(txn: { description: string; counterparty?: string; amount: number }, contracts: Contract[]) {
  const hay = `${txn.description} ${txn.counterparty ?? ''}`;
  const nums = [...hay.matchAll(CONTRACT_RE)];
  if (nums.length > 0) {
    const found = nums[0][0].toUpperCase().replace(/[Дд][Гг]-?/,'ДГ-');
    const c = contracts.find(c => c.contract_number.toUpperCase() === found);
    if (c) return { contractId: c.id, confidence: 'auto' as const, matchReason: `Номер: ${c.contract_number}` };
  }
  for (const c of contracts) {
    const name = (c.customer_name ?? '').toLowerCase();
    if (name.length > 3 && hay.toLowerCase().includes(name))
      return { contractId: c.id, confidence: 'suggested' as const, matchReason: `Клієнт: ${c.customer_name}` };
  }
  for (const c of contracts) {
    if (c.balance && Math.abs(c.balance - txn.amount) < 0.01)
      return { contractId: c.id, confidence: 'suggested' as const, matchReason: `Сума = борг: ${fmt(c.balance)} ₴` };
  }
  return { contractId: '', confidence: 'none' as const, matchReason: '' };
}

const inp: React.CSSProperties = { height: '34px', padding: '0 8px', border: '1.5px solid var(--border)', borderRadius: '7px', fontSize: '12px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '100%' };

export default function BankDrawerButton({ contracts }: { contracts: Contract[] }) {
  const [open,    setOpen]    = useState(false);
  const [txns,    setTxns]    = useState<ParsedTxn[]>([]);
  const [drag,    setDrag]    = useState(false);
  const [err,     setErr]     = useState('');
  const [applying,setApplying]= useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    setErr('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = parseCSV(e.target?.result as string);
        if (!parsed.length) { setErr('Не знайдено надходжень. Перевірте формат файлу.'); return; }
        setTxns(parsed.map(t => ({ ...t, ...autoMatch(t, contracts), saving: false, saved: false })));
      } catch { setErr('Помилка парсингу. Завантажте CSV виписку з Monobank Business.'); }
    };
    reader.readAsText(file, 'utf-8');
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0]; if (f) processFile(f);
  }, [contracts]);

  function setField(id: string, patch: Partial<ParsedTxn>) {
    setTxns(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  async function saveOne(txn: ParsedTxn) {
    if (!txn.contractId || txn.saved) return;
    const contract = contracts.find(c => c.id === txn.contractId);
    if (!contract) return;
    setField(txn.id, { saving: true, error: undefined });
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: txn.contractId, customerId: contract.customer_id,
          amount: txn.amount, paymentMethod: 'bank', businessDate: txn.date,
          description: txn.description || 'Банківський переказ',
          idempotencyKey: `csv:${txn.id}`,
        }),
      });
      const data = await res.json();
      if (res.ok) setField(txn.id, { saving: false, saved: true });
      else setField(txn.id, { saving: false, error: data.error ?? 'Помилка' });
    } catch { setField(txn.id, { saving: false, error: 'Мережева помилка' }); }
  }

  async function applyAll() {
    setApplying(true);
    for (const t of txns.filter(t => t.contractId && !t.saved)) await saveOne(t);
    setApplying(false);
  }

  const autoC = txns.filter(t => t.confidence === 'auto' && !t.saved).length;
  const suggC = txns.filter(t => t.confidence === 'suggested' && !t.saved).length;
  const noneC = txns.filter(t => t.confidence === 'none' && !t.saved).length;
  const savedC = txns.filter(t => t.saved).length;
  const ready = txns.filter(t => t.contractId && !t.saved).length;

  const CONF = {
    auto:      { color: '#15803D', bg: '#F0FDF4', label: '⚡ Авто' },
    suggested: { color: '#B45309', bg: '#FEF3C7', label: '💡 Пропозиція' },
    none:      { color: '#94A3B8', bg: '#F8FAFC', label: '❓ Не знайдено' },
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '36px', padding: '0 16px', borderRadius: '8px', background: '#7C3AED', color: '#fff', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
        <Landmark size={14} /> Банківська виписка
      </button>

      {/* Drawer */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          {/* Backdrop */}
          <div style={{ flex: 1, background: 'rgba(15,23,42,0.4)' }} onClick={() => setOpen(false)} />

          {/* Panel */}
          <div style={{ width: '680px', background: 'var(--bg-card)', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.2)' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10 }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Landmark size={18} color="#7C3AED" /> Банківська виписка
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Перетягніть CSV з Monobank Business → система зіставить автоматично
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Upload zone or stats */}
              {txns.length === 0 ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  style={{ border: `2px dashed ${drag ? '#7C3AED' : 'var(--border)'}`, borderRadius: '12px', padding: '40px 24px', textAlign: 'center', cursor: 'pointer', background: drag ? '#F5F3FF' : 'var(--bg-soft)', transition: 'all 0.15s' }}>
                  <Upload size={32} color={drag ? '#7C3AED' : '#94A3B8'} style={{ marginBottom: '12px' }} />
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Перетягніть CSV файл сюди
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>або натисніть для вибору</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '8px 14px', borderRadius: '8px', display: 'inline-block' }}>
                    Monobank Business → Рахунки → Виписка → Завантажити CSV
                  </div>
                  <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
                </div>
              ) : (
                <>
                  {/* Stats bar */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { label: `⚡ Авто: ${autoC}`,      color: '#15803D', bg: '#F0FDF4' },
                      { label: `💡 Запропоновано: ${suggC}`, color: '#B45309', bg: '#FEF3C7' },
                      { label: `❓ Невідомо: ${noneC}`,  color: '#94A3B8', bg: '#F8FAFC' },
                      { label: `✅ Збережено: ${savedC}`, color: '#1E3A5F', bg: '#EFF4FF' },
                    ].map(s => (
                      <span key={s.label} style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: s.color, background: s.bg }}>{s.label}</span>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => { setTxns([]); setErr(''); }}
                      style={{ height: '34px', padding: '0 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      ← Новий файл
                    </button>
                    {ready > 0 && (
                      <button onClick={applyAll} disabled={applying}
                        style={{ flex: 1, height: '34px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: applying ? 0.7 : 1 }}>
                        {applying ? '⏳ Застосовуємо...' : `✅ Застосувати всі (${ready})`}
                      </button>
                    )}
                  </div>
                </>
              )}

              {err && <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px', display: 'flex', gap: '7px', alignItems: 'center' }}><AlertCircle size={14} />{err}</div>}

              {/* Transaction list */}
              {txns.map(txn => {
                const conf = CONF[txn.confidence];
                return (
                  <div key={txn.id} style={{ background: txn.saved ? '#F0FDF4' : 'var(--bg-soft)', border: `1px solid ${txn.saved ? '#86EFAC' : txn.error ? '#FECACA' : 'var(--border)'}`, borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontSize: '17px', fontWeight: 800, color: '#15803D' }}>+{fmt(txn.amount)} ₴</span>
                        <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>{txn.date}</span>
                      </div>
                      {txn.saved
                        ? <span style={{ fontSize: '12px', color: '#15803D', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={13} /> Збережено</span>
                        : <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, color: conf.color, background: conf.bg }}>{conf.label}</span>
                      }
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.description || '—'}</div>
                    {txn.counterparty && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{txn.counterparty}</div>}
                    {txn.matchReason && !txn.saved && <div style={{ fontSize: '11px', color: conf.color, marginBottom: '6px' }}>🎯 {txn.matchReason}</div>}
                    {txn.error && <div style={{ fontSize: '11px', color: '#DC2626', marginBottom: '6px' }}>{txn.error}</div>}

                    {!txn.saved && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                        <select value={txn.contractId}
                          onChange={e => setField(txn.id, { contractId: e.target.value, confidence: e.target.value ? 'suggested' : 'none' })}
                          style={{ ...inp, flex: 1, cursor: 'pointer' }}>
                          <option value="">— Оберіть договір —</option>
                          {contracts.map(c => <option key={c.id} value={c.id}>{c.contract_number} · {c.customer_name || c.customer_id}</option>)}
                        </select>
                        <button onClick={() => saveOne(txn)} disabled={!txn.contractId || txn.saving}
                          style={{ height: '34px', padding: '0 16px', borderRadius: '8px', border: 'none', background: txn.contractId ? '#1E3A5F' : '#E2E8F0', color: txn.contractId ? '#fff' : '#94A3B8', fontSize: '12px', fontWeight: 700, cursor: txn.contractId ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                          {txn.saving ? '...' : '✓ OK'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
