/**
 * Перерахунок статусу оплати документів закупівлі.
 *
 * Потрібен разово після фіксу зв'язку «оплата ↔ документ»: доки читачі шукали
 * проводки по doc_id (а ваучери пишуть туди свій id), сума оплат виходила 0 і
 * повністю оплачені документи лишались у meta зі статусом "partial".
 *
 *   node scripts/repair-procurement-payment-status.mjs            # тільки показати
 *   node scripts/repair-procurement-payment-status.mjs --apply    # записати
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: docs, error: docErr } = await db
  .from('acc_documents')
  .select('id, doc_number, doc_type, total_cost, supplier_invoice_amount, meta')
  .in('doc_type', ['purchase_order', 'stock_in', 'receipt']);
if (docErr) throw docErr;

const { data: entries, error: entErr } = await db
  .from('money_entries')
  .select('amount, doc_id, doc_type, account_type, meta')
  .in('doc_type', ['supplier_payment', 'supplier_payment_reversal'])
  .eq('account_type', 'supplier');
if (entErr) throw entErr;

// Оплата належить закупівлі через meta.po_id (ваучер) або напряму через doc_id
// (сторно й оплати, зроблені до появи ваучерів).
const paidBy = new Map();
for (const e of entries ?? []) {
  const key = e.meta?.po_id ?? e.doc_id;
  if (key) paidBy.set(key, (paidBy.get(key) ?? 0) + Number(e.amount));
}

let fixed = 0;
for (const d of docs ?? []) {
  const paid = paidBy.get(d.id) ?? 0;
  if (!paid) continue;

  const invoice = Number(d.supplier_invoice_amount ?? d.total_cost ?? 0);
  const isFullyPaid = invoice > 0 && paid >= invoice * 0.999;
  const want = isFullyPaid ? 'paid' : 'partial';
  const meta = d.meta ?? {};

  // Відстрочку не чіпаємо: там статус ставиться навмисно, без проводки.
  if (meta.payment_status === 'deferred' || meta.payment_mode === 'deferred') continue;
  if (meta.payment_status === want && Boolean(meta.is_paid) === isFullyPaid) continue;

  console.log(`${d.doc_number}: сума ${invoice}, оплачено ${paid} — "${meta.payment_status ?? '—'}" → "${want}"`);
  fixed++;

  if (APPLY) {
    const { error } = await db.from('acc_documents')
      .update({ meta: { ...meta, payment_status: want, is_paid: isFullyPaid || undefined } })
      .eq('id', d.id);
    if (error) throw error;
  }
}

console.log(fixed
  ? `\n${APPLY ? 'Виправлено' : 'Потребують виправлення'}: ${fixed}`
  : '\nВсе вже коректно.');
