/**
 * Облікові ефекти статусу «доставлено» — ЄДИНА точка для ручного шляху
 * (PATCH /api/admin/orders/[id]) і крона sync-delivery-status.
 *
 * Раніше комісія маркетплейсу та COD-нарахування партнеру жили тільки в
 * ручному обробнику — замовлення, чию доставку визначав крон по ТТН,
 * проходили повз облік (K2 з аудиту docs/ACCOUNTING-AUDIT.md).
 *
 * Всі операції ідемпотентні: комісія — за ключем commission:{mp}:{orderId},
 * COD партнеру — за order_id всередині credit_cod_to_partner (міграція 057).
 */
import { createServiceClient } from '../supabase';
import { recordMarketplaceCommission } from './money';
import { computePromCommission } from '../prom-commission';
import { computeRozetkaCommission } from '../rozetka-commission';
import { alertAdmin } from '../alert';

export async function applyDeliveredEffects(orderId: string, createdBy = 'system'): Promise<void> {
  const db = createServiceClient();

  const { data: order } = await db
    .from('orders')
    .select('id, order_number, total_price, payment_type, channel_code, partner_code, items')
    .eq('id', orderId)
    .single();
  if (!order) return;

  const items = (order.items ?? []) as { sku: string; qty: number; price: number }[];
  const bizDate = new Date().toISOString().slice(0, 10);

  // ── Комісія Prom.ua ──
  if (order.channel_code === 'prom' && items.length > 0) {
    try {
      const [{ data: planRow }, { data: fallbackRow }] = await Promise.all([
        db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
        db.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle(),
      ]);
      const plan        = (planRow?.value ?? 'single') as 'single' | 'econom';
      const fallbackPct = parseFloat(fallbackRow?.value ?? '3');
      const result = await computePromCommission(items, { plan, fallbackPct });
      if (result.total_commission > 0) {
        const avgPct = Number(order.total_price) > 0
          ? Math.round(result.total_commission / Number(order.total_price) * 10000) / 100
          : fallbackPct;
        await recordMarketplaceCommission({
          orderId:       order.id,
          amount:        result.total_commission,
          marketplace:   'prom',
          commissionPct: avgPct,
          businessDate:  bizDate,
          createdBy,
        });
      }
    } catch (err) {
      alertAdmin(`Комісія Prom не записалась (замовлення #${order.order_number})`, err);
    }
  }

  // ── Комісія Rozetka ──
  if (order.channel_code === 'rozetka' && items.length > 0) {
    try {
      const { data: fallbackRow } = await db
        .from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle();
      const fallbackPct = parseFloat(fallbackRow?.value ?? '15');
      const result = await computeRozetkaCommission(items, { fallbackPct });
      if (result.total_commission > 0) {
        const avgPct = Number(order.total_price) > 0
          ? Math.round(result.total_commission / Number(order.total_price) * 10000) / 100
          : fallbackPct;
        await recordMarketplaceCommission({
          orderId:       order.id,
          amount:        result.total_commission,
          marketplace:   'rozetka',
          commissionPct: avgPct,
          businessDate:  bizDate,
          createdBy,
        });
      }
    } catch (err) {
      alertAdmin(`Комісія Rozetka не записалась (замовлення #${order.order_number})`, err);
    }
  }

  // ── COD на баланс дропшип-партнера ──
  if (order.channel_code === 'dropship' && order.partner_code && order.payment_type === 'cod') {
    try {
      const { data: customer } = await db
        .from('customers').select('id').eq('id', order.partner_code).single();
      if (customer) {
        const { error: creditErr } = await db.rpc('credit_cod_to_partner', {
          p_customer_id: customer.id,
          p_cod_amount:  order.total_price,
          p_order_id:    order.id,
          p_np_fee_pct:  2,
        });
        if (creditErr) throw creditErr;
      }
    } catch (err) {
      alertAdmin(`COD партнеру не нарахувався (замовлення #${order.order_number})`, err);
    }
  }
}
