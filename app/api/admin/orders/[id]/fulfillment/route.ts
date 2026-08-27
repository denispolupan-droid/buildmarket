import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { getOrderFulfillmentInfo } from '../../../../../../lib/accounting/dropship';
import { resolveOrderFulfillment } from '../../../../../../lib/accounting/fulfillment';
import { getOrderReservations } from '../../../../../../lib/accounting/reservations';
import { knownItemSources } from '../../../../../../lib/orders/item-sources';
import { computePromCommission } from '../../../../../../lib/prom-commission';
import { computeRozetkaCommission } from '../../../../../../lib/rozetka-commission';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const { data: order } = await db
    .from('orders')
    .select('items, channel_code')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const items = (order.items ?? []) as { sku: string; qty: number; price?: number }[];
  const skus = items.map(i => i.sku);

  const [info, plan, reservations, balances, stockRows, ledgerRows, confirmedSales] = await Promise.all([
    getOrderFulfillmentInfo(order.items ?? []),
    resolveOrderFulfillment(
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
      .in('account_type', ['revenue', 'cogs', 'marketplace_fee', 'logistics']),
    // Кількість проведених РН — ознака, що факт існує
    db.from('acc_documents')
      .select('id')
      .eq('order_id', id)
      .eq('doc_type', 'sale')
      .eq('status', 'confirmed')
      .is('reversal_of', null),
  ]);

  // ── Факт з проводок (тільки якщо є хоча б одна проведена РН) ──
  let fact: { revenue: number; cogs: number; commission: number; delivery: number; posted_docs: number } | null = null;
  const postedDocs = (confirmedSales.data ?? []).length;
  if (postedDocs > 0) {
    let rev = 0, cogs = 0, fee = 0, delivery = 0;
    for (const e of ledgerRows.data ?? []) {
      const amt = Number(e.amount);
      if (e.account_type === 'revenue') rev -= amt;        // revenue у леджері з мінусом (кредит)
      else if (e.account_type === 'cogs') cogs += amt;      // сторно повернень — від'ємні, нетуються
      else if (e.account_type === 'marketplace_fee') fee += amt;
      // logistics ділиться з landed-cost закупівель — доставку клієнту відокремлює doc_type
      else if (e.account_type === 'logistics' && e.doc_type === 'delivery_cost') delivery += amt;
    }
    fact = {
      revenue:    Math.round(rev * 100) / 100,
      cogs:       Math.round(cogs * 100) / 100,
      commission: Math.round(fee * 100) / 100,
      delivery:   Math.round(delivery * 100) / 100,
      posted_docs: postedDocs,
    };
  }

  // ── Оцінка комісії для НЕпроведених замовлень — тими ж модулями, що рахують факт
  // при доставці (брекети Rozetka ×1.08 / категорійні ставки Prom), а не плоским % ──
  let commissionEstimate: number | null = null;
  const mp = order.channel_code;
  if (!fact && (mp === 'prom' || mp === 'rozetka')) {
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

  // Для позицій, доля яких уже вирішена (є рядок РН або активний резерв),
  // показуємо ФАКТ, а не план. План рахується від сьогоднішніх залишків, тож
  // позиція, яку ми списали зі свого складу останньою, заднім числом виглядала б
  // як «від постачальника» — і картка сперечалась із міткою «Mix» у журналі
  // (живий випадок 27.08, замовлення #26081075).
  const known = await knownItemSources(db, id);

  // Enrich plan items with availability info
  const enrichedPlan = {
    ...plan,
    items: plan.items.map(src => ({
      ...src,
      fulfillment_type:   known.get(src.sku) ?? src.fulfillment_type,
      available_own:      ownAvailMap.get(src.sku) ?? 0,
      supplier_in_stock:  supplierStockMap.get(src.sku) ?? false,
    })),
  };

  return NextResponse.json({ ...info, plan: enrichedPlan, reservations, fact, commission_estimate: commissionEstimate });
}
