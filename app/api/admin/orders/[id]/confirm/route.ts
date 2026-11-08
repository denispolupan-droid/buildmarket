import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { resolveOrderFulfillment } from '../../../../../../lib/accounting/fulfillment';
import { createReservation, getReservationTtlDays, computeExpiresAt } from '../../../../../../lib/accounting/reservations';
import { createDocument } from '../../../../../../lib/accounting/documents';
import { transitionOrder } from '../../../../../../lib/orders/status';
import { orderSnapshot, statusPushEvents, customerNotifyEvents } from '../../../../../../lib/outbox/enqueue';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { withApi } from '../../../../../../lib/api-handler';
import { loadOrderItems } from '../../../../../../lib/orders/lines-read';

async function _POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { id } = await params;
  const { fulfillment_mode } = await req.json() as { fulfillment_mode: 'supplier' | 'own' | 'mixed' };

  if (!['supplier', 'own', 'mixed'].includes(fulfillment_mode)) {
    return NextResponse.json({ error: 'Invalid fulfillment_mode' }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, order_number, status, channel_code, tracking_number, contact, phone, email, company, total_price, rozetka_order_id, prom_order_id, epicentr_order_id, rozetka_data, telegram_chat_id, delivery_type')
    .eq('id', id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? 'Not found' }, { status: 404 });
  }

  // Побічні ефекти підтвердження — події outbox у тій самій транзакції, що й статус
  // (фаза 2): статус на Prom/Rozetka/Епіцентр і Telegram покупцю (підтвердження
  // історично йшло лише в Telegram; адміну зміну статусу не шлемо — рішення власника).
  const eventsFor = (st: string) => [
    ...statusPushEvents(id, orderSnapshot(order as Record<string, unknown>), st, { ttn: order.tracking_number as string | null }),
    ...customerNotifyEvents(id, {
      order_number: order.order_number as number, tracking_number: order.tracking_number as string | null,
      delivery_type: order.delivery_type as string | null, telegram_chat_id: order.telegram_chat_id as string | null,
      email: order.email as string | null, phone: order.phone as string | null, contact: order.contact as string | null,
      company: order.company as string | null, channel_code: order.channel_code as string | null, total_price: Number(order.total_price ?? 0),
    }, st, ['telegram']),
  ];

  // Idempotency: не підтверджувати вже підтверджене
  if (order.status === 'confirmed' || order.status === 'picking' || order.status === 'shipped') {
    return NextResponse.json(
      { error: `Замовлення вже має статус "${order.status}"` },
      { status: 409 },
    );
  }

  // Позиції — з order_lines (етап B, docs/ORDER-LINES-PLAN.md), не з jsonb items
  const items = await loadOrderItems(db, id);
  let newStatus = 'confirmed';
  let purchaseOrderId: string | undefined;

  // TTL резерву з налаштувань
  const ttlDays  = await getReservationTtlDays();
  const expiresAt = computeExpiresAt(ttlDays);

  // ── Supplier: чиста відправка, без складських операцій ───────────────────────
  const confirmedAt = new Date().toISOString();

  const actor = user.email ?? 'admin';
  if (fulfillment_mode === 'supplier') {
    await transitionOrder(db, id, 'confirmed', actor, 'confirm', { fulfillment_mode, confirmed_at: confirmedAt }, eventsFor('confirmed'));

  // ── Own: резервуємо весь товар зі свого складу ────────────────────────────────
  } else if (fulfillment_mode === 'own') {
    const plan = await resolveOrderFulfillment(
      items.map(i => ({ sku: i.sku, qty: i.qty })),
      { channel_code: order.channel_code ?? 'website' },
    );

    if (!plan.has_own) {
      return NextResponse.json(
        { error: 'На власному складі немає товару для виконання цього замовлення' },
        { status: 422 },
      );
    }

    // Групуємо по складах
    const byWarehouse = new Map<number, { sku: string; qty: number }[]>();
    for (const src of plan.items.filter(s => s.fulfillment_type === 'own')) {
      if (!byWarehouse.has(src.warehouse_id)) byWarehouse.set(src.warehouse_id, []);
      byWarehouse.get(src.warehouse_id)!.push({ sku: src.sku, qty: src.qty });
    }

    // Резервуємо (атомарно через SQL-функцію з FOR UPDATE)
    const allInsufficient: { sku: string; requested: number; available: number }[] = [];

    for (const [warehouseId, warehouseItems] of byWarehouse) {
      const result = await createReservation({
        order_id:     id,
        warehouse_id: warehouseId,
        items:        warehouseItems,
        expires_at:   expiresAt,
      });
      allInsufficient.push(...result.insufficient);
    }

    // Якщо є нестача — повертаємо помилку, замовлення не підтверджуємо
    if (allInsufficient.length > 0) {
      return NextResponse.json(
        {
          error: 'Недостатньо товару на складі для резервування',
          insufficient: allInsufficient,
        },
        { status: 422 },
      );
    }

    await transitionOrder(db, id, 'confirmed', actor, 'confirm', { fulfillment_mode, confirmed_at: confirmedAt }, eventsFor('confirmed'));

  // ── Mixed: резервуємо своє + purchase_order для постачальника ────────────────
  } else {
    newStatus = 'awaiting_stock';

    const plan = await resolveOrderFulfillment(
      items.map(i => ({ sku: i.sku, qty: i.qty })),
      { channel_code: order.channel_code ?? 'website' },
    );

    // Резервуємо те що є на складі
    if (plan.has_own) {
      const byWarehouse = new Map<number, { sku: string; qty: number }[]>();
      for (const src of plan.items.filter(s => s.fulfillment_type === 'own')) {
        if (!byWarehouse.has(src.warehouse_id)) byWarehouse.set(src.warehouse_id, []);
        byWarehouse.get(src.warehouse_id)!.push({ sku: src.sku, qty: src.qty });
      }

      const allInsufficient: { sku: string; requested: number; available: number }[] = [];

      for (const [warehouseId, warehouseItems] of byWarehouse) {
        const result = await createReservation({
          order_id:     id,
          warehouse_id: warehouseId,
          items:        warehouseItems,
          expires_at:   expiresAt,
        });
        allInsufficient.push(...result.insufficient);
      }

      if (allInsufficient.length > 0) {
        // При mixed: товарів зі свого складу немає — перекидаємо всіх на постачальника
        console.warn(
          `[confirm/mixed] ownstock insufficient for order ${id}:`,
          allInsufficient.map(i => `${i.sku}: ${i.available}/${i.requested}`).join(', '),
        );
      }
    }

    // Створюємо purchase_order для товарів постачальника
    if (plan.has_dropship) {
      const supplierItems = plan.items.filter(s => s.fulfillment_type === 'dropship');
      const supplierId   = supplierItems[0]?.supplier_id;
      const warehouseId  = supplierItems[0]?.warehouse_id;

      if (supplierId && warehouseId) {
        const orderItemMap = new Map(items.map(i => [i.sku, i]));
        const doc = await createDocument({
          doc_type:     'purchase_order',
          warehouse_id: warehouseId,
          supplier_id:  supplierId,
          order_id:     id,
          notes:        `Замовлення #${order.order_number} — змішане виконання`,
          created_by:   user.email ?? 'admin',
          lines: supplierItems.map(src => ({
            sku:              src.sku,
            qty:              src.qty,
            price:            orderItemMap.get(src.sku)?.price ?? 0,
            cost_price:       0,
            fulfillment_type: 'dropship' as const,
            supplier_id:      supplierId,
            warehouse_id:     warehouseId,
          })),
        });
        purchaseOrderId = doc.id;
      }
    }

    await transitionOrder(db, id, newStatus as 'confirmed' | 'awaiting_stock', actor, 'confirm', { fulfillment_mode, confirmed_at: confirmedAt }, eventsFor(newStatus));
  }

  return NextResponse.json({
    ok: true,
    status: newStatus,
    fulfillment_mode,
    purchase_order_id: purchaseOrderId,
  });
}

export const POST = withApi('admin/orders/[id]/confirm', _POST);
