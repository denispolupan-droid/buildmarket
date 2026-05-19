/**
 * lib/accounting/money.ts
 *
 * Грошовий леджер з подвійним записом.
 *
 * Інваріант I2: Σ записів по одному txn_id = 0.
 * Інваріант I3: баланс контрагента = Σ його записів; прямого запису немає.
 *
 * Знакова конвенція:
 *   +amount (дебет)  = актив / клієнт нам винен / ми витратили
 *   -amount (кредит) = пасив / ми отримали оплату / виручка
 *
 * Типи рахунків:
 *   customer   — дебіторська заборгованість клієнтів
 *   supplier   — кредиторська заборгованість перед постачальниками
 *   partner    — баланс дропшип-партнерів
 *   cash       — готівка
 *   bank       — банківський рахунок
 *   acquiring  — еквайринг
 *   advance    — авансові платежі (невикористані)
 *   revenue    — виручка
 *   cogs       — собівартість продажів
 *   variance   — рахунок розбіжностей
 *   rounding   — округлення
 *   correction — коригування боргу
 */

import { createServiceClient } from '../supabase';

export type AccountType =
  | 'customer' | 'supplier' | 'partner'
  | 'cash' | 'bank' | 'acquiring' | 'advance'
  | 'inventory_asset'
  | 'revenue' | 'cogs' | 'variance' | 'rounding' | 'correction';

export type MoneyEntry = {
  id:              string;
  txn_id:          string;
  account_type:    AccountType;
  counterparty_id: string | null;
  contract_id:     string | null;
  amount:          number;
  currency:        string;
  rate:            number;
  doc_id:          string | null;
  doc_type:        string | null;
  order_id:        string | null;
  description:     string | null;
  idempotency_key: string | null;
  business_date:   string;
  created_at:      string;
  created_by:      string | null;
  meta:            Record<string, unknown>;
};

export type RecordTxnInput = {
  debitAccount:    AccountType;
  debitParty?:     string | null;
  creditAccount:   AccountType;
  creditParty?:    string | null;
  amount:          number;                // позитивне число
  currency?:       string;
  businessDate?:   string;               // ISO date, default today
  docId?:          string | null;
  docType?:        string | null;
  orderId?:        string | null;
  contractId?:     string | null;
  description?:    string | null;
  idempotencyKey?: string | null;
  createdBy?:      string | null;
  meta?:           Record<string, unknown>;
};

// ── Основна функція: записати транзакцію (пару дебет/кредит) ─────────────────

export async function recordTxn(input: RecordTxnInput): Promise<string> {
  const db = createServiceClient();

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await db.rpc('record_money_txn', {
    p_debit_account:   input.debitAccount,
    p_debit_party:     input.debitParty   ?? null,
    p_credit_account:  input.creditAccount,
    p_credit_party:    input.creditParty  ?? null,
    p_amount:          input.amount,
    p_currency:        input.currency     ?? 'UAH',
    p_business_date:   input.businessDate ?? today,
    p_doc_id:          input.docId        ?? null,
    p_doc_type:        input.docType      ?? null,
    p_order_id:        input.orderId      ?? null,
    p_contract_id:     input.contractId   ?? null,
    p_description:     input.description  ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_created_by:      input.createdBy    ?? null,
    p_meta:            input.meta         ?? {},
  });

  if (error) throw error;
  return data as string; // txn_id
}

// ── Зручні обгортки для типових операцій ─────────────────────────────────────

/** Відвантаження клієнту: дебет customer, кредит revenue */
export async function recordShipment(params: {
  customerId:    string;
  contractId?:   string;
  orderId?:      string;
  docId?:        string;
  amount:        number;
  businessDate?: string;
  createdBy?:    string;
  idempotencyKey?: string;
}): Promise<string> {
  return recordTxn({
    debitAccount:  'customer',
    debitParty:    params.customerId,
    creditAccount: 'revenue',
    creditParty:   null,
    amount:        params.amount,
    businessDate:  params.businessDate,
    docId:         params.docId,
    docType:       'sale',
    orderId:       params.orderId,
    contractId:    params.contractId,
    description:   'Відвантаження',
    idempotencyKey: params.idempotencyKey,
    createdBy:     params.createdBy,
  });
}

/** Оплата від клієнта: дебет bank/cash, кредит customer */
export async function recordCustomerPayment(params: {
  customerId:    string;
  contractId?:   string;
  amount:        number;
  paymentMethod: 'bank' | 'cash' | 'acquiring';
  docId?:        string;
  businessDate?: string;
  createdBy?:    string;
  idempotencyKey?: string;
  description?:  string;
}): Promise<string> {
  return recordTxn({
    debitAccount:  params.paymentMethod,
    debitParty:    null,
    creditAccount: 'customer',
    creditParty:   params.customerId,
    amount:        params.amount,
    businessDate:  params.businessDate,
    docId:         params.docId,
    docType:       'payment',
    contractId:    params.contractId,
    description:   params.description ?? 'Оплата від клієнта',
    idempotencyKey: params.idempotencyKey,
    createdBy:     params.createdBy,
  });
}

/** Аванс від клієнта: дебет bank/cash, кредит advance */
export async function recordAdvanceReceived(params: {
  customerId:    string;
  contractId?:   string;
  amount:        number;
  paymentMethod: 'bank' | 'cash' | 'acquiring';
  businessDate?: string;
  createdBy?:    string;
  idempotencyKey?: string;
}): Promise<string> {
  return recordTxn({
    debitAccount:  params.paymentMethod,
    debitParty:    null,
    creditAccount: 'advance',
    creditParty:   params.customerId,
    amount:        params.amount,
    businessDate:  params.businessDate,
    contractId:    params.contractId,
    description:   'Аванс від клієнта',
    idempotencyKey: params.idempotencyKey,
    createdBy:     params.createdBy,
  });
}

/** Залік авансу в рахунок заборгованості */
export async function offsetAdvance(params: {
  customerId:    string;
  contractId?:   string;
  amount:        number;
  businessDate?: string;
  createdBy?:    string;
}): Promise<string> {
  return recordTxn({
    debitAccount:  'advance',
    debitParty:    params.customerId,
    creditAccount: 'customer',
    creditParty:   params.customerId,
    amount:        params.amount,
    businessDate:  params.businessDate,
    contractId:    params.contractId,
    description:   'Залік авансу',
    createdBy:     params.createdBy,
  });
}

/** Повернення товару: сторно виручки і дебіторки */
export async function recordReturn(params: {
  customerId:    string;
  contractId?:   string;
  orderId?:      string;
  docId?:        string;
  amount:        number;
  businessDate?: string;
  createdBy?:    string;
  idempotencyKey?: string;
}): Promise<string> {
  return recordTxn({
    debitAccount:  'revenue',
    debitParty:    null,
    creditAccount: 'customer',
    creditParty:   params.customerId,
    amount:        params.amount,
    businessDate:  params.businessDate,
    docId:         params.docId,
    docType:       'return_out',
    orderId:       params.orderId,
    contractId:    params.contractId,
    description:   'Повернення товару',
    idempotencyKey: params.idempotencyKey,
    createdBy:     params.createdBy,
  });
}

// ── Читання балансу контрагента ───────────────────────────────────────────────

export async function getCustomerBalance(customerId: string, contractId?: string): Promise<number> {
  const db = createServiceClient();

  let query = db
    .from('money_entries')
    .select('amount')
    .eq('account_type', 'customer')
    .eq('counterparty_id', customerId);

  if (contractId) query = query.eq('contract_id', contractId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
}

/** Перевірити чи можна відвантажити (кредитний ліміт + прострочка) */
export async function checkCreditAvailability(contractId: string, newAmount: number): Promise<{
  allowed: boolean;
  reason?: string;
  currentBalance: number;
  creditLimit: number;
  daysOverdue: number;
}> {
  const db = createServiceClient();

  const { data: contract } = await db
    .from('customer_contracts')
    .select('credit_days, credit_limit, customer_id, status')
    .eq('id', contractId)
    .single();

  if (!contract) return { allowed: false, reason: 'Договір не знайдено', currentBalance: 0, creditLimit: 0, daysOverdue: 0 };
  if (contract.status !== 'active') return { allowed: false, reason: 'Договір не активний', currentBalance: 0, creditLimit: 0, daysOverdue: 0 };

  const currentBalance = await getCustomerBalance(contract.customer_id, contractId);

  // Aging: знайти найстарішу неоплачену відвантаження
  const { data: lastShipment } = await db
    .from('money_entries')
    .select('business_date')
    .eq('account_type', 'customer')
    .eq('contract_id', contractId)
    .gt('amount', 0)
    .order('business_date', { ascending: true })
    .limit(1)
    .single();

  const daysOverdue = lastShipment
    ? Math.max(0, Math.floor((Date.now() - new Date(lastShipment.business_date).getTime()) / 86400000) - contract.credit_days)
    : 0;

  if (daysOverdue > 0) {
    return { allowed: false, reason: `Прострочення ${daysOverdue} дн.`, currentBalance, creditLimit: contract.credit_limit, daysOverdue };
  }

  if (contract.credit_limit > 0 && (currentBalance + newAmount) > contract.credit_limit) {
    return { allowed: false, reason: `Перевищення кредитного ліміту (${contract.credit_limit} грн)`, currentBalance, creditLimit: contract.credit_limit, daysOverdue: 0 };
  }

  return { allowed: true, currentBalance, creditLimit: contract.credit_limit, daysOverdue: 0 };
}

// ── Постачальники ─────────────────────────────────────────────────────────────

/** Оприходування товару: дебет inventory_asset, кредит supplier */
export async function recordPurchase(params: {
  supplierId:      string;
  contractId?:     string;
  docId?:          string;
  amount:          number;
  businessDate?:   string;
  createdBy?:      string;
  idempotencyKey?: string;
  description?:    string;
}): Promise<string> {
  return recordTxn({
    debitAccount:   'inventory_asset',
    debitParty:     null,
    creditAccount:  'supplier',
    creditParty:    params.supplierId,
    amount:         params.amount,
    businessDate:   params.businessDate,
    docId:          params.docId,
    docType:        'receipt',
    contractId:     params.contractId,
    description:    params.description ?? 'Оприходування товару',
    idempotencyKey: params.idempotencyKey,
    createdBy:      params.createdBy,
  });
}

/** Оплата постачальнику: дебет supplier, кредит bank/cash */
export async function recordSupplierPayment(params: {
  supplierId:      string;
  contractId?:     string;
  amount:          number;
  paymentMethod:   'bank' | 'cash';
  docId?:          string;
  businessDate?:   string;
  createdBy?:      string;
  idempotencyKey?: string;
  description?:    string;
}): Promise<string> {
  return recordTxn({
    debitAccount:   'supplier',
    debitParty:     params.supplierId,
    creditAccount:  params.paymentMethod,
    creditParty:    null,
    amount:         params.amount,
    businessDate:   params.businessDate,
    docId:          params.docId,
    docType:        'payment',
    contractId:     params.contractId,
    description:    params.description ?? 'Оплата постачальнику',
    idempotencyKey: params.idempotencyKey,
    createdBy:      params.createdBy,
  });
}

/** Повернення постачальнику: дебет supplier, кредит inventory_asset */
export async function recordSupplierReturn(params: {
  supplierId:      string;
  contractId?:     string;
  docId?:          string;
  amount:          number;
  businessDate?:   string;
  createdBy?:      string;
  idempotencyKey?: string;
}): Promise<string> {
  return recordTxn({
    debitAccount:   'supplier',
    debitParty:     params.supplierId,
    creditAccount:  'inventory_asset',
    creditParty:    null,
    amount:         params.amount,
    businessDate:   params.businessDate,
    docId:          params.docId,
    docType:        'supplier_return',
    contractId:     params.contractId,
    description:    'Повернення постачальнику',
    idempotencyKey: params.idempotencyKey,
    createdBy:      params.createdBy,
  });
}

// ── COGS: записати собівартість продажів ──────────────────────────────────────

export async function recordCOGS(params: {
  amount:        number;
  docId?:        string;
  orderId?:      string;
  businessDate?: string;
  createdBy?:    string;
  idempotencyKey?: string;
}): Promise<string> {
  return recordTxn({
    debitAccount:  'cogs',
    debitParty:    null,
    creditAccount: 'inventory_asset',
    creditParty:   null,
    amount:        params.amount,
    businessDate:  params.businessDate,
    docId:         params.docId,
    docType:       'cogs',
    orderId:       params.orderId,
    description:   'Собівартість продажів (FIFO)',
    idempotencyKey: params.idempotencyKey,
    createdBy:     params.createdBy,
  });
}
