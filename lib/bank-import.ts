// Спільна логіка імпорту банківської виписки (Monobank Business CSV):
// парсинг + авто-зіставлення платежів до договорів/спец-дебіторів.
// Використовується сторінкою /admin/finance/bank і дровером на дашборді —
// раніше код був продубльований і розходився.

export type BankContract = {
  id: string;
  contract_number: string;
  customer_id: string;
  customer_name: string | null;
  balance?: number;
};

export type ParsedBankTxn = {
  id: string;
  date: string;            // YYYY-MM-DD
  amount: number;          // UAH, лише вхідні
  description: string;
  counterparty?: string;
  iban?: string;
};

export type MatchResult = {
  contractId: string;      // id договору або 'sp:<counterparty>' для спец-дебітора
  confidence: 'auto' | 'suggested' | 'none';
  matchReason: string;
};

// Спец-дебітори без договору: виплати НП (COD) та маркетплейсів.
// value кодується як `sp:<counterparty>`; API приймає specialCounterparty.
export const BANK_SPECIAL_OPTS: { value: string; cp: 'np:cod' | 'mp:prom' | 'mp:rozetka'; label: string }[] = [
  { value: 'sp:np:cod',     cp: 'np:cod',     label: '📦 Виплата НП (наложені платежі)' },
  { value: 'sp:mp:rozetka', cp: 'mp:rozetka', label: '🟢 Виплата Rozetka' },
  { value: 'sp:mp:prom',    cp: 'mp:prom',    label: '🟠 Виплата Prom.ua' },
];

const CONTRACT_RE = /[Дд][Гг]-?\d{4}-[A-Za-z0-9]{6,}/g;

export function splitCSVLine(line: string, delim: string): string[] {
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

export function parseBankDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

/** Парсер CSV Monobank Business — лише вхідні транзакції (amount > 0). */
export function parseMonobankBusiness(text: string): ParsedBankTxn[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map(h => h.replace(/"/g, '').toLowerCase().trim());
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

  const results: ParsedBankTxn[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], delim);
    if (cols.length < 3) continue;

    const rawAmount = amountIdx >= 0 ? cols[amountIdx]?.replace(/["\s]/g, '').replace(',', '.') : '';
    const amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount <= 0) continue;

    const date = parseBankDate(dateIdx >= 0 ? cols[dateIdx]?.replace(/"/g, '').trim() : '');
    if (!date) continue;

    results.push({
      id:           `${i}_${amount}_${date}`,
      date,
      amount,
      description:  descIdx >= 0 ? cols[descIdx]?.replace(/"/g, '').trim() : '',
      counterparty: cpIdx >= 0 ? cols[cpIdx]?.replace(/"/g, '').trim() : undefined,
      iban:         ibanIdx >= 0 ? cols[ibanIdx]?.replace(/"/g, '').trim() : undefined,
    });
  }
  return results;
}

function fmtAmount(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Авто-зіставлення транзакції: договір (номер/назва/сума) або спец-дебітор. */
export function autoMatchBankTxn(
  txn: Pick<ParsedBankTxn, 'description' | 'counterparty' | 'amount'>,
  contracts: BankContract[],
): MatchResult {
  const haystack = `${txn.description} ${txn.counterparty ?? ''}`.toLowerCase();

  // 1. Номер договору в призначенні → висока впевненість
  const numMatches = [...`${txn.description} ${txn.counterparty ?? ''}`.matchAll(CONTRACT_RE)];
  if (numMatches.length > 0) {
    const found = numMatches[0][0].toUpperCase().replace(/[Дд][Гг]-?/, 'ДГ-');
    const contract = contracts.find(c => c.contract_number.toUpperCase() === found);
    if (contract) return { contractId: contract.id, confidence: 'auto', matchReason: `Номер договору: ${contract.contract_number}` };
  }

  // 2. Назва клієнта в призначенні
  for (const c of contracts) {
    const name = (c.customer_name ?? '').toLowerCase();
    if (name.length > 3 && haystack.includes(name)) {
      return { contractId: c.id, confidence: 'suggested', matchReason: `Назва клієнта: ${c.customer_name}` };
    }
  }

  // 3. Точний збіг суми з боргом
  for (const c of contracts) {
    if (c.balance && Math.abs(c.balance - txn.amount) < 0.01) {
      return { contractId: c.id, confidence: 'suggested', matchReason: `Сума збігається з боргом: ${fmtAmount(c.balance)} ₴` };
    }
  }

  // 4. Виплати спец-дебіторів: НП (COD) та маркетплейси
  if (/нова\s*пошта|novaposhta|nova\s*poshta/.test(haystack)) {
    return { contractId: 'sp:np:cod', confidence: 'suggested', matchReason: 'Схоже на виплату НП (наложені платежі)' };
  }
  if (/rozetka|розетка/.test(haystack)) {
    return { contractId: 'sp:mp:rozetka', confidence: 'suggested', matchReason: 'Схоже на виплату Rozetka' };
  }
  if (/prom\.ua|пром\.юа|тов[\s"«]*уапром/.test(haystack)) {
    return { contractId: 'sp:mp:prom', confidence: 'suggested', matchReason: 'Схоже на виплату Prom.ua' };
  }

  return { contractId: '', confidence: 'none', matchReason: '' };
}

/** Тіло запиту до /api/admin/payments для збереження зіставленої транзакції. */
export function buildPaymentBody(
  txn: ParsedBankTxn,
  contractId: string,
  contracts: BankContract[],
): Record<string, unknown> | null {
  const special = BANK_SPECIAL_OPTS.find(o => o.value === contractId);
  if (special) {
    return {
      specialCounterparty: special.cp,
      amount:        txn.amount,
      paymentMethod: 'bank',
      businessDate:  txn.date,
      description:   txn.description || special.label,
    };
  }
  const contract = contracts.find(c => c.id === contractId);
  if (!contract) return null;
  return {
    contractId,
    customerId:    contract.customer_id,
    amount:        txn.amount,
    paymentMethod: 'bank',
    businessDate:  txn.date,
    description:   txn.description || 'Банківський переказ',
    idempotencyKey: `csv:${txn.id}`,
  };
}
