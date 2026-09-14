/**
 * Дропшип-партнер у грошовому леджері (рахунок `partner`, контрагент = customers.id).
 *
 * До 09.2026 баланс партнера жив лише в partner_balance_transactions і в облік не
 * потрапляв зовсім: гроші поповнень висіли на еквайрингу/банку без джерела, продаж
 * ішов на «гостя» за ціною кінцевого клієнта, наложка партнера — нікуди.
 *
 * Знак, як і всюди в money.ts: мінус на `partner` = ми винні партнеру.
 *
 *   поповнення карткою      DR acquiring        / CR partner[P]
 *   поповнення переказом    DR bank             / CR partner[P]      (екран «Банк»)
 *   виплата партнеру        DR partner[P]       / CR bank            (екран «Банк»)
 *   продаж (при врученні)   DR customer[P]      / CR revenue         (confirmDocument, ціна = закупка)
 *     + залік балансу       DR partner[P]       / CR customer[P]     (тут)
 *   наложка вручена         DR customer[np:cod] / CR partner[P]      (НоваПей винна нам, ми — партнеру)
 *     + комісія НоваПей     DR partner[P]       / CR logistics[np]   (утримали з партнера те, що НоваПей утримає з нас)
 *
 * Внутрішні рухи балансу (списання під замовлення, повернення при скасуванні до
 * відвантаження) у леджер не йдуть: реальні гроші не рухались, а продаж визнається
 * при врученні (Варіант 3). Тому до вручення баланс кабінету й рахунок `partner`
 * відрізняються рівно на суму замовлень у дорозі.
 *
 * Усі проводки ідемпотентні за ключем (record_money_txn повертає наявну).
 */
import { createServiceClient } from '../supabase';
import { recordTxn } from './money';
import { SALE_DEBTOR } from './sale-party';

type Db = ReturnType<typeof createServiceClient>;

const round2 = (n: number) => Math.round(n * 100) / 100;

async function dropshipPartnerOf(db: Db, orderId: string): Promise<{ partner: string; orderNumber: number; paymentType: string | null; total: number } | null> {
  const { data: o } = await db
    .from('orders')
    .select('order_number, channel_code, partner_code, payment_type, total_price')
    .eq('id', orderId)
    .maybeSingle();
  if (!o || o.channel_code !== 'dropship' || !o.partner_code) return null;
  return { partner: String(o.partner_code), orderNumber: o.order_number as number, paymentType: o.payment_type ?? null, total: Number(o.total_price) || 0 };
}

/** Поповнення балансу карткою (вебхук Monobank). */
export async function recordPartnerCardTopup(params: {
  customerId: string; amount: number; invoiceId: string; businessDate?: string;
}): Promise<void> {
  await recordTxn({
    debitAccount: 'acquiring', creditAccount: 'partner', creditParty: params.customerId,
    amount: round2(params.amount), businessDate: params.businessDate, docType: 'partner_topup',
    description: 'Поповнення балансу дропшип-партнера карткою',
    idempotencyKey: `partner-topup:mono:${params.invoiceId}`, createdBy: 'monobank_webhook',
    meta: { invoice_id: params.invoiceId },
  });
}

/**
 * Поповнення балансу переказом на рахунок (екран «Банк» → «Поповнення балансу
 * дропшип-партнера»): гроші в банк, аванс партнера + зарахування на баланс кабінету.
 * Якщо цей переказ уже зарахували вручну з «Партнерів» (та сама сума за 3 дні, без
 * прив'язки) — баланс вдруге не поповнюємо, лише проводимо й прив'язуємо.
 */
export async function recordPartnerBankTopup(params: {
  customerId: string; amount: number; monoTxnId: string; businessDate: string; createdBy: string; description?: string;
}): Promise<{ txnId: string; balanceCredited: boolean }> {
  const db = createServiceClient();
  const amount = round2(params.amount);
  const extRef = `mono-txn:${params.monoTxnId}`;

  const { data: linked } = await db.from('partner_balance_transactions').select('id').eq('external_ref', extRef).maybeSingle();
  let balanceCredited = false;
  if (!linked) {
    const since = new Date(Date.parse(params.businessDate) - 3 * 86400000).toISOString();
    const { data: manual } = await db
      .from('partner_balance_transactions')
      .select('id')
      .eq('customer_id', params.customerId)
      .eq('tx_type', 'top_up')
      .eq('amount', amount)
      .is('external_ref', null)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (manual) {
      await db.from('partner_balance_transactions').update({ external_ref: extRef }).eq('id', manual.id);
    } else {
      const { error } = await db.from('partner_balance_transactions').insert({
        customer_id: params.customerId, tx_type: 'top_up', amount,
        description: params.description || 'Поповнення балансу переказом на рахунок',
        created_by: params.createdBy, external_ref: extRef,
      });
      if (error) throw new Error(error.message);
      balanceCredited = true;
    }
  }

  const txnId = await recordTxn({
    debitAccount: 'bank', creditAccount: 'partner', creditParty: params.customerId,
    amount, businessDate: params.businessDate, docType: 'partner_topup',
    description: params.description || 'Поповнення балансу дропшип-партнера переказом',
    idempotencyKey: extRef, createdBy: params.createdBy, meta: { mono_txn_id: params.monoTxnId, manual: true },
  });
  return { txnId, balanceCredited };
}

/**
 * Виплата партнеру з рахунку (екран «Банк» → «Виплата дропшип-партнеру»). Баланс
 * кабінету списує схвалення заявки (approve_payout), тож тут лише рух грошей — і
 * тільки якщо така схвалена заявка є, інакше кабінет і облік розійдуться.
 */
export async function recordPartnerBankPayout(params: {
  customerId: string; amount: number; monoTxnId: string; businessDate: string; createdBy: string; description?: string;
}): Promise<string> {
  const db = createServiceClient();
  const amount = round2(params.amount);
  const since = new Date(Date.parse(params.businessDate) - 45 * 86400000).toISOString();
  const { data: req } = await db
    .from('partner_payout_requests')
    .select('id')
    .eq('customer_id', params.customerId)
    .eq('status', 'approved')
    .eq('method', 'bank')
    .eq('amount', amount)
    .gte('processed_at', since)
    .limit(1)
    .maybeSingle();
  if (!req) {
    throw new Error(`Немає схваленої заявки на виплату ${amount} ₴ цьому партнеру — спершу схваліть її в «Партнерах», щоб списався баланс кабінету`);
  }
  return recordTxn({
    debitAccount: 'partner', debitParty: params.customerId, creditAccount: 'bank',
    amount, businessDate: params.businessDate, docType: 'partner_payout',
    description: params.description || 'Виплата дропшип-партнеру',
    idempotencyKey: `mono-txn:${params.monoTxnId}`, createdBy: params.createdBy,
    meta: { mono_txn_id: params.monoTxnId, manual: true, payout_request_id: req.id },
  });
}

/**
 * Залік балансу партнера в рахунок продажу — після проведення РН дропшип-замовлення.
 * Партнер заплатив закупку заздалегідь (списання з балансу), тож борг, який виникає
 * при продажу, одразу закривається його авансом.
 */
export async function postPartnerSaleOffset(docId: string, orderId: string | null, opts: { businessDate?: string; createdBy?: string } = {}): Promise<void> {
  if (!orderId) return;
  const db = createServiceClient();
  const p = await dropshipPartnerOf(db, orderId);
  if (!p) return;
  const { data: doc } = await db.from('acc_documents').select('total_amount, status').eq('id', docId).maybeSingle();
  const amount = round2(Number(doc?.total_amount ?? 0));
  if (doc?.status !== 'confirmed' || amount <= 0) return;
  await recordTxn({
    debitAccount: 'partner', debitParty: p.partner, creditAccount: 'customer', creditParty: p.partner,
    amount, businessDate: opts.businessDate, docId, docType: 'advance_offset', orderId,
    description: `Залік балансу дропшип-партнера (замовлення #${p.orderNumber})`,
    idempotencyKey: `partner-offset:${docId}`, createdBy: opts.createdBy ?? 'system',
  });
}

/** Сторно заліку при скасуванні проведеного продажу. */
export async function reversePartnerSaleOffset(docId: string, opts: { createdBy?: string } = {}): Promise<void> {
  const db = createServiceClient();
  const { data: legs } = await db
    .from('money_entries')
    .select('txn_id, counterparty_id, amount, order_id')
    .eq('doc_id', docId)
    .eq('doc_type', 'advance_offset')
    .eq('account_type', 'partner')
    .limit(10);
  for (const leg of legs ?? []) {
    const amount = Math.abs(Number(leg.amount));
    if (amount <= 0) continue;
    await recordTxn({
      debitAccount: 'customer', debitParty: leg.counterparty_id, creditAccount: 'partner', creditParty: leg.counterparty_id,
      amount, docId, docType: 'dropship_cancel', orderId: leg.order_id ?? undefined,
      description: 'Сторно заліку балансу партнера (скасування замовлення)',
      idempotencyKey: `reversal:${leg.txn_id}`, createdBy: opts.createdBy ?? 'system',
    });
  }
}

/**
 * Наложка дропшип-посилки вручена: гроші зібрала НоваПей на наш рахунок (np:cod),
 * партнеру ми винні повну суму, а комісію НоваПей утримуємо з нього.
 * Суми беремо з фактичних рухів балансу партнера по замовленню (cod_credit + np_fee),
 * щоб облік збігався з тим, що бачить партнер у кабінеті.
 */
export async function recordPartnerCodCollected(orderId: string, opts: { businessDate?: string; createdBy?: string } = {}): Promise<void> {
  const db = createServiceClient();
  const p = await dropshipPartnerOf(db, orderId);
  if (!p || p.paymentType !== 'cod') return;
  const { data: txs } = await db
    .from('partner_balance_transactions')
    .select('tx_type, amount')
    .eq('order_id', orderId)
    .in('tx_type', ['cod_credit', 'np_fee'])
    .limit(20);
  // cod_credit — повна наложка, np_fee — утримана комісія (міграція 118)
  const gross = round2((txs ?? []).filter(t => t.tx_type === 'cod_credit').reduce((s, t) => s + Number(t.amount), 0));
  const fee   = round2(-(txs ?? []).filter(t => t.tx_type === 'np_fee').reduce((s, t) => s + Number(t.amount), 0));
  if (gross <= 0) return;

  await recordTxn({
    debitAccount: 'customer', debitParty: SALE_DEBTOR.npCod, creditAccount: 'partner', creditParty: p.partner,
    amount: gross, businessDate: opts.businessDate, docType: 'partner_cod', orderId,
    description: `Наложка дропшип-посилки вручена — належить партнеру (замовлення #${p.orderNumber})`,
    idempotencyKey: `partner-cod:${orderId}`, createdBy: opts.createdBy ?? 'system',
  });
  if (fee > 0) {
    await recordTxn({
      debitAccount: 'partner', debitParty: p.partner, creditAccount: 'logistics', creditParty: 'np',
      amount: fee, businessDate: opts.businessDate, docType: 'partner_cod', orderId,
      description: `Комісія НоваПей за наложку утримана з партнера (замовлення #${p.orderNumber})`,
      idempotencyKey: `partner-cod-fee:${orderId}`, createdBy: opts.createdBy ?? 'system',
    });
  }
}
