/**
 * Виписка NovaPay → облік (аудит K3, «Фаза 2», рішення власника 06.09.2026).
 *
 *  1. ingestNovapayStatement — витягує виписку за період, кладе кожен документ у
 *     novapay_txns рівно раз (id = ID документа). Нічого не проводить.
 *  2. postNpPayouts — виплати наложки за реєстрами НП (kind=cod_payout, status
 *     unmatched). Склад реєстру підбирається (lib/novapay-statement.matchNpRegister:
 *     НоваПей платить у день вручення мінус 0,5 %) серед ще не виплачених наложок:
 *       по кожній ЕН:  DR novapay (нетто) + DR logistics[np] (0,5 %) / CR np:cod (брутто)
 *     Не підібрано → сумою: DR novapay (нетто) / CR np:cod (нетто), позначка
 *     cod_payout_aggregate — видно на екрані як «не розкладено по ЕН».
 *  Залишок np:cod = брутто ще не виплачених по ЕН наложок − реєстри, чий склад не
 *  підібрано (проведені сумою). Жодних автоматичних «утримань»-затичок: що не
 *  зійшлось — видно на екрані «НоваПей» списком ЕН і реєстрів.
 *  Списання з рахунку лишаються unmatched — категоризує людина («НоваПей»).
 *
 * Ключі: np-payout:{docId}:{orderId} + np-fee:{docId}:{orderId} (по ЕН),
 *        np-payout:{docId}:agg (сумою).
 */
import { createServiceClient } from './supabase';
import { recordTxn } from './accounting/money';
import { SALE_DEBTOR } from './accounting/sale-party';
import { getNovapayAccountExtract } from './novapay-api';
import { parseNovapayStatement, classifyNovapayDoc, registerNumberOf, extractOwnAccount, matchNpRegister } from './novapay-statement';

const ddmmyyyy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
const isDup = (err: unknown) => /unique|duplicate|23505/.test(String(err instanceof Error ? err.message : err));
const NP_COD_FEE_KEY = 'novapay_cod_fee_pct';   // app_settings, за замовчуванням 0.5
const MATCH_WINDOW_DAYS = 4;

type Db = ReturnType<typeof createServiceClient>;

export type NovapayIngestResult = { fetched: number; inserted: number; from: string; to: string };

export async function ingestNovapayStatement(days = 10, dateFrom?: Date): Promise<NovapayIngestResult> {
  const db = createServiceClient();
  const to = new Date();
  const from = dateFrom ?? new Date(Date.now() - days * 86400000);
  const extracts = await getNovapayAccountExtract(ddmmyyyy(from), ddmmyyyy(to));
  let fetched = 0, inserted = 0;
  for (const e of extracts) {
    const account = extractOwnAccount(e.extract);
    const docs = parseNovapayStatement(e.extract, account);
    fetched += docs.length;
    for (const d of docs) {
      if (!d.docId) continue;
      const kind = classifyNovapayDoc(d);
      const { data: claimed } = await db.from('novapay_txns').upsert({
        id: d.docId, account, txn_date: d.date, amount: d.amount, direction: d.direction,
        counterparty: d.counterparty, purpose: d.purpose, code: d.code,
        register_no: kind === 'cod_payout' ? registerNumberOf(d.purpose) : null,
        kind, status: 'unmatched', raw: d as unknown as Record<string, unknown>,
      }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
      if (claimed?.length) inserted++;
    }
  }
  return { fetched, inserted, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

async function npCodFeePct(db: Db): Promise<number> {
  const { data } = await db.from('app_settings').select('value').eq('key', NP_COD_FEE_KEY).maybeSingle();
  const v = parseFloat(String(data?.value ?? ''));
  return Number.isFinite(v) ? v : 0.5;
}

type CodOrder = { id: string; order_number: number; gross: number; delivered: string };

/** Вручені НП-наложки (не дропшип, не Rozetka Доставка), ще без виплати по ЕН. */
async function unsettledNpCodOrders(db: Db, from: string, to: string): Promise<CodOrder[]> {
  const { data: orders } = await db.from('orders').select('id, order_number, total_price, delivered_at')
    .eq('status', 'delivered').eq('payment_type', 'cod')
    .in('delivery_type', ['nova', 'nova_poshta']).neq('channel_code', 'dropship')
    .gte('delivered_at', `${from}T00:00:00`).lt('delivered_at', `${to}T00:00:00`)
    .order('delivered_at').limit(500);
  if (!orders?.length) return [];
  const ids = orders.map(o => o.id as string);
  const { data: settled } = await db.from('money_entries').select('order_id')
    .like('idempotency_key', 'np-payout:%').in('order_id', ids).limit(5000);
  const done = new Set((settled ?? []).map(r => r.order_id as string));
  return orders.filter(o => !done.has(o.id as string))
    .map(o => ({ id: o.id as string, order_number: o.order_number as number, gross: Number(o.total_price), delivered: String(o.delivered_at).slice(0, 10) }));
}

export type NpPayoutsResult = { processed: number; matched: number; aggregate: number; net: number; orders: number };

/** Проводить усі ще не проведені виплати за реєстрами. Ідемпотентно. */
export async function postNpPayouts(createdBy = 'cron:novapay-statement'): Promise<NpPayoutsResult> {
  const db = createServiceClient();
  const feePct = await npCodFeePct(db);
  const { data: rows } = await db.from('novapay_txns').select('id, txn_date, amount, register_no')
    .eq('kind', 'cod_payout').eq('status', 'unmatched').order('txn_date').order('id').limit(500);
  const res: NpPayoutsResult = { processed: 0, matched: 0, aggregate: 0, net: 0, orders: 0 };

  for (const r of rows ?? []) {
    const docId = r.id as string; const date = String(r.txn_date); const net = Number(r.amount); const reg = (r.register_no as string | null) ?? '—';
    // Наш delivered_at (крон трекінгу) може відставати від НП на день — тому +1 день уперед
    const from = new Date(Date.parse(date) - MATCH_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
    const to   = new Date(Date.parse(date) + 2 * 86400000).toISOString().slice(0, 10);
    const cands = await unsettledNpCodOrders(db, from, to);
    const hit = matchNpRegister(net, cands.map(c => ({ id: c.id, gross: c.gross })), feePct);
    let posted = false;
    if (hit) {
      for (const oid of hit.ids) {
        const o = cands.find(c => c.id === oid)!;
        const oNet = hit.nets[oid]; const fee = Math.round((o.gross - oNet) * 100) / 100;
        try {
          await recordTxn({
            debitAccount: 'novapay', debitParty: null, creditAccount: 'customer', creditParty: SALE_DEBTOR.npCod,
            amount: oNet, businessDate: date, docType: 'payment', orderId: oid,
            description: `Виплата наложки НоваПей (реєстр № ${reg}, замовлення #${o.order_number})`,
            idempotencyKey: `np-payout:${docId}:${oid}`, createdBy, meta: { novapay_doc_id: docId, register_no: reg, gross: o.gross, fee_pct: feePct },
          });
          posted = true;
        } catch (err) { if (!isDup(err)) throw err; }
        if (fee > 0) {
          try {
            await recordTxn({
              debitAccount: 'logistics', debitParty: 'np', creditAccount: 'customer', creditParty: SALE_DEBTOR.npCod,
              amount: fee, businessDate: date, docType: 'np_fee', orderId: oid,
              description: `Комісія НоваПей ${feePct}% за виплату наложки (замовлення #${o.order_number})`,
              idempotencyKey: `np-fee:${docId}:${oid}`, createdBy, meta: { novapay_doc_id: docId, register_no: reg, fee_pct: feePct },
            });
          } catch (err) { if (!isDup(err)) throw err; }
        }
      }
      await db.from('novapay_txns').update({ status: 'posted', category: 'cod_payout', posted_at: new Date().toISOString(), posted_by: createdBy, note: `ЕН: ${hit.ids.map(id => '#' + cands.find(c => c.id === id)!.order_number).join(', ')}` }).eq('id', docId);
      res.matched++; res.orders += hit.ids.length;
    } else {
      try {
        await recordTxn({
          debitAccount: 'novapay', debitParty: null, creditAccount: 'customer', creditParty: SALE_DEBTOR.npCod,
          amount: net, businessDate: date, docType: 'payment',
          description: `Виплата наложки НоваПей за реєстром № ${reg} (склад не підібрано)`,
          // суфікс :agg — щоб не збігатись із ключем np-payout:{docId} першого прогону 06.09 (сторнований)
          idempotencyKey: `np-payout:${docId}:agg`, createdBy, meta: { novapay_doc_id: docId, register_no: reg, aggregate: true },
        });
        posted = true;
      } catch (err) { if (!isDup(err)) throw err; }
      await db.from('novapay_txns').update({ status: 'posted', category: 'cod_payout_aggregate', posted_at: new Date().toISOString(), posted_by: createdBy, note: 'склад реєстру не підібрано — проведено сумою' }).eq('id', docId);
      res.aggregate++;
    }
    res.processed++; if (posted) res.net += net;
  }
  res.net = Math.round(res.net * 100) / 100;
  return res;
}

/** Дата останнього реєстру виплат (з novapay_txns). */
export async function lastNpRegisterDate(): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from('novapay_txns').select('txn_date').eq('kind', 'cod_payout').order('txn_date', { ascending: false }).limit(1).maybeSingle();
  return (data?.txn_date as string | undefined) ?? null;
}

/** Вручені НП-наложки без виплати по ЕН — «НоваПей ще не виплатила» (усі, не лише за вікно). */
export async function unsettledNpCod(): Promise<CodOrder[]> {
  return unsettledNpCodOrders(createServiceClient(), '2000-01-01', '2999-12-31');
}
