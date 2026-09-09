/**
 * Автопроводка списань NovaPay, які завжди означають одне й те саме
 * (поповнення балансів Rozetka/Prom, рахунки-фактури Нової Пошти).
 * Правила — lib/novapay-autopost-rules.
 *
 * Проводки ті самі, що й при ручному виборі на екрані «НоваПей»:
 *   поповнення — DR marketplace_balance[<площадка>] / CR novapay;
 *   витрата    — DR logistics / CR novapay + рядок у expenses.
 * Ключ np-txn:{id} той самий, що й у ручного шляху, тож автопроводка й людина
 * не задвоять один документ, хто б не встиг першим.
 */
import { createServiceClient } from './supabase';
import { recordMarketplaceTopup, recordTxn } from './accounting/money';
import { alertAdmin } from './alert';
import { classifyNovapayOutgoing, type NovapayOutgoing } from './novapay-autopost-rules';

export { classifyNovapayOutgoing } from './novapay-autopost-rules';
export type { NovapayOutgoing, NovapayAutoRule } from './novapay-autopost-rules';

export type NovapayAutopostResult = { checked: number; posted: number; total: number; failed: number };

/** Проводить усі ще не категоризовані списання, які впізнало правило. Ідемпотентно. */
export async function postNovapayAutoTopups(createdBy = 'cron:novapay-autopost'): Promise<NovapayAutopostResult> {
  const db = createServiceClient();
  const { data: rows } = await db.from('novapay_txns')
    .select('id, txn_date, amount, direction, counterparty, purpose')
    .eq('direction', 'out').eq('status', 'unmatched')
    .order('txn_date').order('id').limit(200);
  const res: NovapayAutopostResult = { checked: 0, posted: 0, total: 0, failed: 0 };

  for (const r of rows ?? []) {
    res.checked++;
    const rule = classifyNovapayOutgoing(r as NovapayOutgoing);
    if (!rule) continue;
    const amount = Number(r.amount);
    const date = String(r.txn_date);
    const description = `${r.purpose ?? ''} — ${r.counterparty ?? ''}`.trim();
    const key = `np-txn:${r.id}`;
    try {
      let txnId: string;
      let title: string;
      if (rule.kind === 'topup') {
        txnId = await recordMarketplaceTopup({
          marketplace: rule.marketplace, amount, paymentMethod: 'novapay', businessDate: date,
          createdBy, idempotencyKey: key, description,
        });
        title = `💳 Поповнення балансу ${rule.marketplace === 'rozetka' ? 'Rozetka' : 'Prom'} ${amount.toFixed(2)} ₴ проведено автоматично`;
      } else {
        txnId = await recordTxn({
          debitAccount: rule.category, creditAccount: 'novapay', amount, businessDate: date, docType: 'expense',
          description, idempotencyKey: key, createdBy, meta: { novapay_doc_id: r.id, counterparty: r.counterparty, auto: true },
        });
        await db.from('expenses').insert({
          expense_type: rule.category, description, counterparty: r.counterparty ?? null, amount,
          payment_method: 'novapay', source: 'novapay', source_id: r.id, txn_id: txnId,
          business_date: date, created_by: createdBy,
        });
        title = `🚚 Витрата логістики ${amount.toFixed(2)} ₴ (рахунок Нової Пошти) проведена автоматично`;
      }
      await db.from('novapay_txns').update({
        status: 'posted', category: rule.category, txn_id: txnId,
        note: `авто: ${rule.label}`, posted_at: new Date().toISOString(), posted_by: createdBy,
      }).eq('id', r.id);
      res.posted++; res.total += amount;
      alertAdmin(title, `NovaPay ${date}: ${description}`);
    } catch (err) {
      res.failed++;
      console.error('[novapay-autopost] failed:', r.id, err instanceof Error ? err.message : err);
    }
  }
  res.total = Math.round(res.total * 100) / 100;
  return res;
}
