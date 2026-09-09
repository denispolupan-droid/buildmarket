/**
 * Автопроводка списань NovaPay, які завжди означають одне й те саме
 * (поповнення балансів Rozetka/Prom). Правила — lib/novapay-autopost-rules.
 *
 * Проводка та сама, що й при ручному виборі «Поповнення балансу» на екрані
 * «НоваПей»: DR marketplace_balance[<площадка>] / CR novapay, ключ np-txn:{id}.
 * Ключ той самий, що й у ручного шляху, тож автопроводка й людина не задвоять
 * один документ, хто б не встиг першим.
 */
import { createServiceClient } from './supabase';
import { recordMarketplaceTopup } from './accounting/money';
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
    try {
      const txnId = await recordMarketplaceTopup({
        marketplace: rule.marketplace, amount, paymentMethod: 'novapay', businessDate: date,
        createdBy, idempotencyKey: `np-txn:${r.id}`, description,
      });
      await db.from('novapay_txns').update({
        status: 'posted', category: rule.category, txn_id: txnId,
        note: `авто: ${rule.label}`, posted_at: new Date().toISOString(), posted_by: createdBy,
      }).eq('id', r.id);
      res.posted++; res.total += amount;
      alertAdmin(
        `💳 Поповнення балансу ${rule.marketplace === 'rozetka' ? 'Rozetka' : 'Prom'} ${amount.toFixed(2)} ₴ проведено автоматично`,
        `NovaPay ${date}: ${description}`,
      );
    } catch (err) {
      res.failed++;
      console.error('[novapay-autopost] failed:', r.id, err instanceof Error ? err.message : err);
    }
  }
  res.total = Math.round(res.total * 100) / 100;
  return res;
}
