'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Check, ChevronDown, AlertCircle, Banknote, Zap } from 'lucide-react';

type Contract = {
  id: string;
  contract_number: string;
  customer_id: string;
  customer_name: string | null;
  balance?: number;
};

type ParsedTxn = {
  id:          string;           // synthetic id
  date:        string;           // ISO date
  amount:      number;           // UAH
  description: string;
  counterparty?: string;         // назва платника
  iban?:       string;
  // matching
  confidence:  'auto' | 'suggested' | 'none';
  matchReason?: string;
  contractId:  string;
  saving?:     boolean;
  saved?:      boolean;
  error?:      string;
};

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── CSV parsers ───────────────────────────────────────────────────────────────

function parseMonobankBusiness(text: string): Omit<ParsedTxn, 'confidence' | 'contractId' | 'matchReason'>[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detect delimiter
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map(h => h.replace(/"/g, '').toLowerCase().trim());

  // Column detection
  const col = (keys: string[]) => {
    for (const k of keys) {
      const idx = headers.findIndex(h => h.includes(k));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const dateIdx   = col(['дата і час', 'дата операц', 'date']);
  const amountIdx = col(['сума в валюті картки', 'сума операц', 'сума', 'amount']);
  const descIdx   = col(['деталі операції', 'призначення', 'опис', 'description']);
  const cpIdx     = col(['назва контрагента', 'назва банку', 'counterparty', 'назва отримувача', 'назва платника']);
  const ibanIdx   = col(['iban']);

  const results: Omit<ParsedTxn, 'confidence' | 'contractId' | 'matchReason'>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], delim);
    if (cols.length < 3) continue;

    const rawAmount = amountIdx >= 0 ? cols[amountIdx]?.replace(/["\s]/g, '').replace(',', '.') : '';
    const amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount <= 0) continue; // only incoming

    const rawDate = dateIdx >= 0 ? cols[dateIdx]?.replace(/"/g, '').trim() : '';
    const date = parseDate(rawDate);
    if (!date) continue;

    results.push({
      id:          `${i}_${amount}_${date}`,
      date,
      amount,
      description: descIdx >= 0 ? cols[descIdx]?.replace(/"/g, '').trim() : '',
      counterparty: cpIdx >= 0 ? cols[cpIdx]?.replace(/"/g, '').trim() : undefined,
      iban:         ibanIdx >= 0 ? cols[ibanIdx]?.replace(/"/g, '').trim() : undefined,
    });
  }
  return results;
}

function splitCSVLine(line: string, delim: string): string[] {
  const result: string[] = [];
  let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; cur += ch; }
    else if (ch === delim && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // DD.MM.YYYY or DD.MM.YYYY HH:MM:SS
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

// ── Auto-matching logic ───────────────────────────────────────────────────────

const CONTRACT_RE = /[Дд][Гг]-?\d{4}-[A-Za-z0-9]{6,}/g;

function autoMatch(
  txn: Omit<ParsedTxn, 'confidence' | 'contractId' | 'matchReason'>,
  contracts: Contract[],
): { contractId: string; confidence: ParsedTxn['confidence']; matchReason: string } {
  const haystack = `${txn.description} ${txn.counterparty ?? ''}`.toLowerCase();

  // 1. Contract number in description → high confidence
  const numMatches = [...(txn.description + ' ' + (txn.counterparty ?? '')).matchAll(CONTRACT_RE)];
  if (numMatches.length > 0) {
    const found = numMatches[0][0].toUpperCase().replace(/[Дд][Гг]-?/, 'ДГ-');
    const contract = contracts.find(c => c.contract_number.toUpperCase() === found);
    if (contract) return { contractId: contract.id, confidence: 'auto', matchReason: `Номер договору: ${contract.contract_number}` };
  }

  // 2. Customer name in description → suggested
  for (const c of contracts) {
    const name = (c.customer_name ?? '').toLowerCase();
    if (name.length > 3 && haystack.includes(name)) {
      return { contractId: c.id, confidence: 'suggested', matchReason: `Назва клієнта: ${c.customer_name}` };
    }
  }

  // 3. Exact amount match to outstanding balance → suggested
  for (const c of contracts) {
    if (c.balance && Math.abs(c.balance - txn.amount) < 0.01) {
      return { contractId: c.id, confidence: 'suggested', matchReason: `Сума збігається з боргом: ${fmt(c.balance)} ₴` };
    }
  }

  return { contractId: '', confidence: 'none', matchReason: '' };
}

// ── Component ─────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  height: '36px', padding: '0 10px', border: '1.5px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', outline: 'none',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
};

export default function BankStatementClient({ contracts }: { contracts: Contract[] }) {
  const [txns,     setTxns]     = useState<ParsedTxn[]>([]);
  const [dragging, setDragging] = useState(false);
  const [parseErr, setParseErr] = useState('');
  const [applying, setApplying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    setParseErr('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target?.result as string;
        const parsed = parseMonobankBusiness(text);
        if (parsed.length === 0) { setParseErr('Не знайдено вхідних транзакцій. Перевірте формат файлу.'); return; }

        const enriched: ParsedTxn[] = parsed.map(t => ({
          ...t,
          ...autoMatch(t, contracts),
          saving: false, saved: false,
        }));
        setTxns(enriched);
      } catch { setParseErr('Помилка парсингу файлу. Перевірте що це CSV виписка Monobank.'); }
    };
    reader.readAsText(file, 'utf-8');
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [contracts]);

  function setTxnField(id: string, patch: Partial<ParsedTxn>) {
    setTxns(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  async function saveOne(txn: ParsedTxn) {
    if (!txn.contractId || txn.saved) return;
    const contract = contracts.find(c => c.id === txn.contractId);
    if (!contract) return;

    setTxnField(txn.id, { saving: true, error: undefined });
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId:    txn.contractId,
          customerId:    contract.customer_id,
          amount:        txn.amount,
          paymentMethod: 'bank',
          businessDate:  txn.date,
          description:   txn.description || 'Банківський переказ',
          idempotencyKey: `csv:${txn.id}`,
        }),
      });
      const data = await res.json();
      if (res.ok) setTxnField(txn.id, { saving: false, saved: true });
      else setTxnField(txn.id, { saving: false, error: data.error ?? 'Помилка' });
    } catch { setTxnField(txn.id, { saving: false, error: 'Мережева помилка' }); }
  }

  async function applyAll() {
    setApplying(true);
    const toSave = txns.filter(t => t.contractId && !t.saved && (t.confidence === 'auto' || t.confidence === 'suggested'));
    for (const t of toSave) await saveOne(t);
    setApplying(false);
  }

  const autoCount      = txns.filter(t => t.confidence === 'auto' && !t.saved).length;
  const suggestedCount = txns.filter(t => t.confidence === 'suggested' && !t.saved).length;
  const noneCount      = txns.filter(t => t.confidence === 'none' && !t.saved).length;
  const savedCount     = txns.filter(t => t.saved).length;
  const readyToApply   = txns.filter(t => t.contractId && !t.saved).length;

  const CONF_CFG = {
    auto:      { label: 'Авто',        color: '#15803D', bg: '#F0FDF4', icon: Zap },
    suggested: { label: 'Пропозиція',  color: '#B45309', bg: '#FEF3C7', icon: ChevronDown },
    none:      { label: 'Не знайдено', color: '#94A3B8', bg: '#F8FAFC', icon: AlertCircle },
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Банківська виписка
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Завантажте CSV з Monobank Business → система автоматично зіставить платежі до договорів
        </p>
      </div>

      {/* Upload zone */}
      {txns.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#1E3A5F' : 'var(--border)'}`,
            borderRadius: '16px', padding: '64px 32px',
            textAlign: 'center', cursor: 'pointer',
            background: dragging ? '#EFF4FF' : 'var(--bg-soft)',
            transition: 'all 0.15s',
          }}>
          <Upload size={40} color={dragging ? '#1E3A5F' : '#94A3B8'} style={{ marginBottom: '16px' }} />
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Перетягніть CSV файл сюди
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            або натисніть для вибору файлу
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '10px 16px', borderRadius: '8px', display: 'inline-block' }}>
            📥 Monobank Business → Рахунки → Виписка → Завантажити CSV
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
        </div>
      )}

      {parseErr && (
        <div style={{ padding: '14px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#DC2626', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
          <AlertCircle size={16} /> {parseErr}
        </div>
      )}

      {/* Results */}
      {txns.length > 0 && (
        <>
          {/* Summary + actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { label: `⚡ Авто: ${autoCount}`,         color: '#15803D', bg: '#F0FDF4' },
                { label: `💡 Пропозицій: ${suggestedCount}`, color: '#B45309', bg: '#FEF3C7' },
                { label: `❓ Не знайдено: ${noneCount}`,  color: '#94A3B8', bg: '#F8FAFC' },
                { label: `✅ Збережено: ${savedCount}`,   color: '#1E3A5F', bg: '#EFF4FF' },
              ].map(s => (
                <span key={s.label} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, color: s.color, background: s.bg }}>
                  {s.label}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setTxns([]); setParseErr(''); }}
                style={{ height: '36px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                ← Новий файл
              </button>
              {readyToApply > 0 && (
                <button onClick={applyAll} disabled={applying}
                  style={{ height: '36px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: applying ? 0.7 : 1 }}>
                  {applying
                    ? '⏳ Застосовуємо...'
                    : `✅ Застосувати всі (${readyToApply})`}
                </button>
              )}
            </div>
          </div>

          {/* Transactions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {txns.map(txn => {
              const conf = CONF_CFG[txn.confidence];
              const selectedContract = contracts.find(c => c.id === txn.contractId);

              return (
                <div key={txn.id} style={{
                  background: txn.saved ? '#F0FDF4' : 'var(--bg-card)',
                  border: `1px solid ${txn.saved ? '#86EFAC' : txn.error ? '#FECACA' : 'var(--border)'}`,
                  borderRadius: '10px', padding: '12px 16px',
                  display: 'grid', gridTemplateColumns: '110px 1fr auto auto',
                  gap: '12px', alignItems: 'center',
                }}>
                  {/* Amount + date */}
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#15803D' }}>+{fmt(txn.amount)} ₴</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{txn.date}</div>
                  </div>

                  {/* Description + counterparty */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {txn.description || '—'}
                    </div>
                    {txn.counterparty && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {txn.counterparty}
                      </div>
                    )}
                    {txn.matchReason && !txn.saved && (
                      <div style={{ fontSize: '11px', color: conf.color, marginTop: '2px' }}>
                        🎯 {txn.matchReason}
                      </div>
                    )}
                    {txn.error && (
                      <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>{txn.error}</div>
                    )}
                  </div>

                  {/* Contract selector */}
                  {txn.saved ? (
                    <div style={{ fontSize: '12px', color: '#15803D', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Check size={14} /> {selectedContract?.contract_number ?? '—'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, color: conf.color, background: conf.bg, flexShrink: 0 }}>
                        {conf.label}
                      </span>
                      <select
                        value={txn.contractId}
                        onChange={e => setTxnField(txn.id, { contractId: e.target.value, confidence: e.target.value ? 'suggested' : 'none' })}
                        style={{ ...inp, width: '200px', cursor: 'pointer', fontSize: '12px' }}>
                        <option value="">— Договір —</option>
                        {contracts.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.contract_number} · {c.customer_name || c.customer_id}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Save button */}
                  {!txn.saved && (
                    <button
                      onClick={() => saveOne(txn)}
                      disabled={!txn.contractId || txn.saving}
                      style={{ height: '32px', padding: '0 14px', borderRadius: '8px', border: 'none', background: txn.contractId ? '#1E3A5F' : '#E2E8F0', color: txn.contractId ? '#fff' : '#94A3B8', fontSize: '12px', fontWeight: 700, cursor: txn.contractId ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                      {txn.saving ? '...' : '✓ OK'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
