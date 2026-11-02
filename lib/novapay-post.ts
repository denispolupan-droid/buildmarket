import { createServiceClient } from './supabase';
import { recordTxn, recordSupplierPayment, recordMarketplaceTopup, type AccountType } from './accounting/money';

// Проведення одного документа виписки NovaPay за категорією — спільне для екрана
// «НоваПей» і виправлень агента звірки (lib/recon/fixes). Списання =
// DR <витрата | bank | cash | supplier | owner | marketplace_balance> / CR novapay;
// зарахування не за реєстром = DR novapay / CR bank | cash | owner. Ідемпотентно
// за id документа (np-txn:{id}), тож повторне натискання нічого не дублює.

export const EXPENSE_ACCOUNTS: AccountType[] = ['logistics', 'loading', 'customs', 'packaging', 'rent', 'salary', 'marketing', 'opex', 'taxes'];
const TRANSFER_TARGETS = { 'transfer:bank': 'bank', 'transfer:cash': 'cash' } as const;
const TOPUP_TARGETS = { 'topup:rozetka': 'rozetka', 'topup:prom': 'prom' } as const;

export type NovapayRow = { id: string; txn_date: string; amount: number | string; direction: string; counterparty: string | null; purpose: string | null; status: string };

export class NovapayPostError extends Error {}

/** category: як на екрані «НоваПей»; для постачальника — 'supplier' + supplierId (або 'supplier:<id>'). */
export async function postNovapayRow(row: NovapayRow, p: { category: string; supplierId?: string | null; description?: string | null; note?: string | null; by: string }): Promise<string> {
  if (row.status === 'posted') throw new NovapayPostError('Уже проведено');
  const db = createServiceClient();
  let category = p.category;
  let supplierId = p.supplierId ?? '';
  if (category.startsWith('supplier:')) { supplierId = category.slice('supplier:'.length); category = 'supplier'; }
  const by = p.by;
  const note = p.note ?? null;
  const mark = (txnId: string) => db.from('novapay_txns').update({
    status: 'posted', category: category === 'supplier' ? `supplier:${supplierId}` : category, txn_id: txnId, note,
    posted_at: new Date().toISOString(), posted_by: by,
  }).eq('id', row.id);

  // Зарахування не за реєстром (переказ з Mono / внесення готівки): DR novapay / CR bank|cash
  if (row.direction === 'in') {
    const src = category === 'transfer-in:bank' ? 'bank' : category === 'transfer-in:cash' ? 'cash' : category === 'transfer-in:owner' ? 'owner' : null;
    if (!src) throw new NovapayPostError('Для зарахування доступні лише переказ з Mono, внесення готівки або внесок власника');
    const txnId = await recordTxn({
      debitAccount: 'novapay', creditAccount: src, amount: Number(row.amount), businessDate: String(row.txn_date),
      docType: src === 'owner' ? 'owner_contribution' : 'transfer', description: (p.description ?? '').trim() || (src === 'owner' ? 'Внесок власника' : `Переказ ${src === 'bank' ? 'Mono' : 'каса'} → НоваПей`),
      idempotencyKey: `np-txn:${row.id}`, createdBy: by, meta: { novapay_doc_id: row.id, manual: true, ...(src === 'owner' ? {} : { transfer: true }) },
    });
    await mark(txnId);
    return txnId;
  }

  const isTransfer = category in TRANSFER_TARGETS;
  const isTopup    = category in TOPUP_TARGETS;
  const isExpense  = EXPENSE_ACCOUNTS.includes(category as AccountType);
  if (!isTransfer && !isTopup && !isExpense && category !== 'owner' && category !== 'supplier') {
    throw new NovapayPostError('Невірна категорія');
  }

  const amount = Number(row.amount);
  const date = String(row.txn_date);
  const description = (p.description ?? '').trim() || `${row.purpose ?? ''} — ${row.counterparty ?? ''}`.trim();
  const key = `np-txn:${row.id}`;
  const baseMeta = { novapay_doc_id: row.id, counterparty: row.counterparty, manual: true };

  let txnId: string;
  if (category === 'supplier') {
    if (!supplierId) throw new NovapayPostError('Вкажіть постачальника');
    txnId = await recordSupplierPayment({ supplierId, amount, paymentMethod: 'novapay', businessDate: date, createdBy: by,
      description: description || 'Оплата постачальнику', idempotencyKey: key });
  } else if (isTopup) {
    txnId = await recordMarketplaceTopup({ marketplace: TOPUP_TARGETS[category as keyof typeof TOPUP_TARGETS], amount, paymentMethod: 'novapay',
      businessDate: date, createdBy: by, idempotencyKey: key, description });
  } else if (category === 'owner') {
    txnId = await recordTxn({ debitAccount: 'owner', creditAccount: 'novapay', amount, businessDate: date, docType: 'owner_draw',
      description: description || 'Вилучення власника', idempotencyKey: key, createdBy: by, meta: baseMeta });
  } else {
    const debitAccount = (isTransfer ? TRANSFER_TARGETS[category as keyof typeof TRANSFER_TARGETS] : category) as AccountType;
    txnId = await recordTxn({
      debitAccount, creditAccount: 'novapay', amount, businessDate: date,
      docType: isTransfer ? 'transfer' : 'expense', description, idempotencyKey: key, createdBy: by,
      meta: { ...baseMeta, ...(isTransfer ? { transfer: true } : {}) },
    });
  }
  if (isExpense) {
    // source_id — uuid (acc_documents); номер документа виписки — у doc_ref (до 12.09 insert мовчки падав)
    const { error: expErr } = await db.from('expenses').insert({
      expense_type: category, description, counterparty: row.counterparty ?? null, amount,
      payment_method: 'novapay', source: 'novapay', source_id: null, doc_ref: row.id, txn_id: txnId,
      business_date: date, created_by: by,
    });
    if (expErr) console.error('[novapay] expenses insert failed:', row.id, expErr.message);
  }
  await mark(txnId);
  return txnId;
}
