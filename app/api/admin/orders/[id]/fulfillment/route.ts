import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { getOrderFulfillmentInfo } from '../../../../../../lib/accounting/dropship';
import { resolveOrderFulfillment } from '../../../../../../lib/accounting/fulfillment';
import { getOrderReservations } from '../../../../../../lib/accounting/reservations';
import { knownItemPlan, type KnownSource } from '../../../../../../lib/orders/item-sources';
import { computePromCommission } from '../../../../../../lib/prom-commission';
import { computeRozetkaCommission } from '../../../../../../lib/rozetka-commission';
import { computeEpicentrCommission, getEpicentrFallbackPct } from '../../../../../../lib/epicentr-commission';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { withApi } from '../../../../../../lib/api-handler';
import { loadOrderItems } from '../../../../../../lib/orders/lines-read';
import { classifyPLEntry } from '../../../../../../lib/accounting/profit-rules';
import { loadOrderDealCosts, loadRzPayRate, paidViaRzPay } from '../../../../../../lib/deal-costs';

async function _GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = createServiceClient();

  const { data: order } = await db
    .from('orders')
    .select('channel_code, payment_type, delivery_type, total_price')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Позиції — з order_lines (етап B), не з jsonb items
  const items = await loadOrderItems(db, id);
  const skus = items.map(i => i.sku);

  // Джерело фіксується при відвантаженні — у рядках видаткової. Якщо воно вже
  // зафіксоване для ВСІХ позицій, роутер більше не питаємо: він рахує від
  // сьогоднішніх залишків, тобто заново «вирішує» те, що давно вирішено, і
  // затримує картку на кожному відкритті вже відправленого замовлення.
  const fixed = await knownItemPlan(db, id);
  const allFixed = items.length > 0 && items.every(i => fixed.has(i.sku));

  const [info, plan, reservations, balances, stockRows, ledgerRows, confirmedSales] = await Promise.all([
    getOrderFulfillmentInfo(items as unknown as Parameters<typeof getOrderFulfillmentInfo>[0]),
    allFixed
      ? Promise.resolve(planFromFixed(items, fixed))
      : resolveOrderFulfillment(
          items.map(i => ({ sku: i.sku, qty: i.qty })),
          { channel_code: order.channel_code ?? 'website' },
        ),
    getOrderReservations(id),
    // Own warehouse availability
    db.from('stock_balance')
      .select('sku, qty_available, warehouse_id')
      .in('sku', skus),
    // Supplier stock status
    db.from('product_stock')
      .select('sku, stock_qty, stock_status')
      .in('sku', skus),
    // ФАКТ прибутку з леджера: виручка/COGS/комісія/доставка за проводками цього замовлення
    // (враховують FIFO, сторно, додаткові збори на кшталт «Дешева доставка Prom»)
    db.from('money_entries')
      .select('account_type, amount, doc_type')
      .eq('order_id', id)
      .in('account_type', ['revenue', 'cogs', 'marketplace_fee', 'acquiring_fee', 'logistics']),
    // Кількість проведених РН — ознака, що факт існує
    db.from('acc_documents')
      .select('id')
      .eq('order_id', id)
      .eq('doc_type', 'sale')
      .eq('status', 'confirmed')
      .is('reversal_of', null),
  ]);

  // ── Факт з проводок (тільки якщо є хоча б одна проведена РН) ──
  let fact: { revenue: number; cogs: number; commission: number; delivery: number; extra: number; posted_docs: number } | null = null;
  const postedDocs = (confirmedSales.data ?? []).length;
  if (postedDocs > 0) {
    let rev = 0, cogs = 0, fee = 0, delivery = 0, extra = 0;
    for (const e of ledgerRows.data ?? []) {
      const amt = Number(e.amount);
      if (e.account_type === 'revenue') rev -= amt;        // revenue у леджері з мінусом (кредит)
      else if (e.account_type === 'cogs') cogs += amt;      // сторно повернень — від'ємні, нетуються
      else if (e.account_type === 'marketplace_fee') fee += amt;
      // logistics ділиться з landed-cost закупівель — доставку клієнту відокремлює doc_type
      else if (e.account_type === 'logistics' && e.doc_type === 'delivery_cost') delivery += amt;
      // Решта витрат угоди за profit-rules: еквайринг і збори НП (переказ наложки,
      // утримання, збір Rozetka Доставки). До 07.11.2026 картка їх не віднімала —
      // і її прибуток був вищим, ніж у «Огляді» та «Звітах».
      else if (classifyPLEntry(e.account_type, e.doc_type) === 'deal') extra += amt;
    }
    fact = {
      revenue:    Math.round(rev * 100) / 100,
      cogs:       Math.round(cogs * 100) / 100,
      commission: Math.round(fee * 100) / 100,
      delivery:   Math.round(delivery * 100) / 100,
      extra:      Math.round(extra * 100) / 100,
      posted_docs: postedDocs,
    };
  }

  // Винагорода RozetkaPay за переказ: у леджері вона без замовлення, розбивка —
  // order_deal_costs (точна з реєстру); ще не виплачене — оцінка за середньою ставкою.
  // Те саме правило, що в lib/accounting/estimate («Огляд», «Аналітика»).
  let paymentFee: { amount: number; source: 'fact' | 'estimate' } | null = null;
  const factPay = (await loadOrderDealCosts(db, [id])).get(id);
  if (factPay != null) paymentFee = { amount: factPay, source: 'fact' };
  else if (paidViaRzPay({ channel_code: order.channel_code, payment_type: order.payment_type, delivery_type: order.delivery_type })) {
    const rate = await loadRzPayRate(db);
    const base = fact ? fact.revenue : Number(order.total_price ?? 0);
    if (rate && base > 0) paymentFee = { amount: Math.round(base * rate * 100) / 100, source: 'estimate' };
  }

  // ── Оцінка комісії для НЕпроведених замовлень — тими ж модулями, що рахують факт
  // при доставці (брекети Rozetka ×1.08 / категорійні ставки Prom), а не плоским % ──
  let commissionEstimate: number | null = null;
  const mp = order.channel_code;
  if (!fact && (mp === 'prom' || mp === 'rozetka' || mp === 'epicentr')) {
    try {
      const calcItems = items
        .filter(i => (i.price ?? 0) > 0)
        .map(i => ({ sku: i.sku, qty: Number(i.qty), price: Number(i.price) }));
      if (calcItems.length > 0) {
        if (mp === 'prom') {
          const [{ data: planRow }, { data: fbRow }] = await Promise.all([
            db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
            db.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle(),
          ]);
          const plan = (planRow?.value ?? 'single') as 'single' | 'econom';
          const fallbackPct = parseFloat(fbRow?.value ?? '3');
          commissionEstimate = (await computePromCommission(calcItems, { plan, fallbackPct })).total_commission;
        } else if (mp === 'epicentr') {
          commissionEstimate = (await computeEpicentrCommission(calcItems, { fallbackPct: await getEpicentrFallbackPct(db) })).total_commission;
        } else {
          const { data: fbRow } = await db
            .from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle();
          const fallbackPct = parseFloat(fbRow?.value ?? '15');
          commissionEstimate = (await computeRozetkaCommission(calcItems, { fallbackPct })).total_commission;
        }
      }
    } catch {
      commissionEstimate = null;  // оцінка недоступна — фронт впаде на збережену _commission
    }
  }

  // Build per-sku availability maps
  const ownAvailMap = new Map<string, number>();
  for (const b of balances.data ?? []) {
    const current = ownAvailMap.get(b.sku) ?? 0;
    ownAvailMap.set(b.sku, current + Number(b.qty_available));
  }

  const supplierStockMap = new Map<string, boolean>();
  for (const s of stockRows.data ?? []) {
    supplierStockMap.set(s.sku, s.stock_status === 'in_stock');
  }

  // Для позицій, доля яких уже вирішена, показуємо ФАКТ, а не план. Це важливо
  // і в змішаному випадку, коли частина замовлення вже поїхала, а частина ні:
  // план для відвантаженої позиції збрехав би (живий випадок 27.08, #26081075).
  const enrichedPlan = {
    ...plan,
    items: plan.items.map(src => ({
      ...src,
      fulfillment_type:   fixed.get(src.sku)?.fulfillment_type ?? src.fulfillment_type,
      available_own:      ownAvailMap.get(src.sku) ?? 0,
      supplier_in_stock:  supplierStockMap.get(src.sku) ?? false,
    })),
  };

  return NextResponse.json({
    ...info,
    plan: enrichedPlan,
    reservations,
    fact,
    commission_estimate: commissionEstimate,
    payment_fee: paymentFee,
    // Джерело зафіксоване документами — картка може показати його як факт,
    // а не як щось, що зараз перераховується.
    source_fixed: allFixed,
  });
}

export const GET = withApi('admin/orders/[id]/fulfillment', _GET);

/** План із зафіксованих рядків — той самий формат, що віддає роутер. */
function planFromFixed(
  items: { sku: string; qty: number }[],
  fixed: Map<string, KnownSource>,
) {
  const planItems = items.map(i => {
    const src = fixed.get(i.sku)!;
    return {
      sku:              i.sku,
      qty:              i.qty,
      fulfillment_type: src.fulfillment_type,
      warehouse_id:     src.warehouse_id ?? 0,
      supplier_id:      src.supplier_id,
    };
  });
  return {
    items:        planItems,
    has_own:      planItems.some(p => p.fulfillment_type === 'own'),
    has_dropship: planItems.some(p => p.fulfillment_type === 'dropship'),
    unresolved:   [] as string[],
  };
}
