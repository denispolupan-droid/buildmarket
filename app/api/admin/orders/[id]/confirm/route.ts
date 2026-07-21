import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { resolveOrderFulfillment } from '../../../../../../lib/accounting/fulfillment';
import { createReservation, getReservationTtlDays, computeExpiresAt } from '../../../../../../lib/accounting/reservations';
import { createDocument } from '../../../../../../lib/accounting/documents';
import { notifyAdminStatusChange } from '../../../../../../lib/telegram';
import { ourStatusToRozetkaStatus, setRozetkaOrderStatus } from '../../../../../../lib/rozetka-api';
import { ourStatusToPromStatus, setPromOrderStatus } from '../../../../../../lib/prom-api';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { fulfillment_mode } = await req.json() as { fulfillment_mode: 'supplier' | 'own' | 'mixed' };

  if (!['supplier', 'own', 'mixed'].includes(fulfillment_mode)) {
    return NextResponse.json({ error: 'Invalid fulfillment_mode' }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, order_number, status, items, channel_code, tracking_number, contact, phone, rozetka_order_id, prom_order_id')
    .eq('id', id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? 'Not found' }, { status: 404 });
  }

  // Idempotency: не підтверджувати вже підтверджене
  if (order.status === 'confirmed' || order.status === 'picking' || order.status === 'shipped') {
    return NextResponse.json(
      { error: `Замовлення вже має статус "${order.status}"` },
      { status: 409 },
    );
  }

  const items = (order.items ?? []) as { sku: string; qty: number }[];
  let newStatus = 'confirmed';
  let purchaseOrderId: string | undefined;

  // TTL резерву з налаштувань
  const ttlDays  = await getReservationTtlDays();
  const expiresAt = computeExpiresAt(ttlDays);

  // ── Supplier: чиста відправка, без складських операцій ───────────────────────
  const confirmedAt = new Date().toISOString();

  if (fulfillment_mode === 'supplier') {
    await db.from('orders').update({ status: 'confirmed', fulfillment_mode, confirmed_at: confirmedAt }).eq('id', id);

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

    await db.from('orders').update({ status: 'confirmed', fulfillment_mode, confirmed_at: confirmedAt }).eq('id', id);

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
        const orderItemMap = new Map(
          (order.items as { sku: string; qty: number; price: number }[]).map(i => [i.sku, i]),
        );
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

    await db.from('orders').update({ status: newStatus, fulfillment_mode, confirmed_at: confirmedAt }).eq('id', id);
  }

  // Telegram (best-effort, не впливає на результат)
  try {
    notifyAdminStatusChange(
      { order_number: order.order_number, contact: order.contact, phone: order.phone },
      newStatus,
    );
  } catch { /* не критично */ }

  // Push status to Rozetka (fire-and-forget) if this is a Rozetka order
  const rozetkaOrderId = order.rozetka_order_id as number | null;
  if (rozetkaOrderId) {
    const rozStatus = ourStatusToRozetkaStatus(newStatus);
    if (rozStatus) {
      setRozetkaOrderStatus(rozetkaOrderId, rozStatus).catch(err =>
        console.error('[rozetka] setRozetkaOrderStatus failed:', err),
      );
    }
  }

  // Push status to Prom.ua (fire-and-forget) if this is a Prom order
  const promOrderId = order.prom_order_id as number | null;
  if (promOrderId) {
    const promStatus = ourStatusToPromStatus(newStatus);
    if (promStatus) {
      setPromOrderStatus(Number(promOrderId), promStatus).catch(err =>
        console.error('[prom] setPromOrderStatus failed:', err),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    status: newStatus,
    fulfillment_mode,
    purchase_order_id: purchaseOrderId,
  });
}
