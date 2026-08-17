import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { resolveOrderFulfillment } from '../../../../../../lib/accounting/fulfillment';
import {
  createReservation, releaseReservation,
  getReservationTtlDays, computeExpiresAt,
} from '../../../../../../lib/accounting/reservations';
import { createDocument } from '../../../../../../lib/accounting/documents';

/**
 * Зміна джерела відвантаження ПІСЛЯ проведення.
 *
 * До цього джерело фіксувалось назавжди в момент проведення. Але поки
 * замовлення підтверджене й ще не збирається, рішення «своє чи постачальник»
 * цілком може змінитись: з'явився нюанс у постачальника, приїхав товар на свій
 * склад. Тож дозволяємо переграти, доки це безпечно, і перебудовуємо все, що
 * від джерела залежить: резерви й замовлення постачальнику.
 *
 * Межі безпеки (інакше 409):
 *   • статус лише new / confirmed / awaiting_stock — після «збирається» товар
 *     уже фізично беруть, міняти джерело пізно;
 *   • ЗП по замовленню має бути ще чернеткою й не відправленим постачальнику —
 *     інакше постачальник уже бачить замовлення, яке ми тут мовчки перепишемо.
 *
 * Статус замовлення НЕ чіпаємо: його веде менеджер, а тихий стрибок
 * confirmed ↔ awaiting_stock із журналу виглядав би як чужа дія.
 */

const EDITABLE_STATUSES = ['new', 'confirmed', 'awaiting_stock'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('admin');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const { sources } = await req.json() as { sources: Record<string, 'own' | 'dropship'> };
  if (!sources || typeof sources !== 'object') {
    return NextResponse.json({ error: 'Не передано sources' }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: order } = await db
    .from('orders')
    .select('id, order_number, status, items, channel_code')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });

  if (!EDITABLE_STATUSES.includes(order.status)) {
    return NextResponse.json(
      { error: `Джерело можна міняти до збирання замовлення (зараз статус «${order.status}»)` },
      { status: 409 },
    );
  }

  // ── ЗП постачальнику: переписуємо лише те, чого постачальник ще не бачив ────
  const { data: linkedPos } = await db
    .from('acc_documents')
    .select('id, doc_number, status, procurement_status, email_sent_at')
    .eq('order_id', id)
    .eq('doc_type', 'purchase_order')
    .neq('status', 'cancelled');

  const locked = (linkedPos ?? []).find(p => p.status !== 'draft' || p.email_sent_at);
  if (locked) {
    return NextResponse.json(
      { error: `Замовлення постачальнику ${locked.doc_number ?? ''} вже ${locked.email_sent_at ? 'відправлене' : 'проведене'} — спочатку скасуйте його` },
      { status: 409 },
    );
  }

  const items = (order.items ?? []) as { sku: string; qty: number; price?: number }[];

  // Резерви знімаємо ДО планування: інакше власний резерв цього ж замовлення
  // зменшує qty_available і позиція виглядає недоступною сама для себе.
  await releaseReservation(id, 'manual');

  const plan = await resolveOrderFulfillment(
    items.map(i => ({ sku: i.sku, qty: i.qty })),
    { channel_code: order.channel_code ?? 'website' },
  );
  const planBySku = new Map(plan.items.map(s => [s.sku, s]));

  const wantOwn = items.filter(i => sources[i.sku] === 'own');
  const ttlDays = await getReservationTtlDays();
  const expiresAt = computeExpiresAt(ttlDays);

  // ── Резервуємо те, що просять «своїм» ──────────────────────────────────────
  const insufficient: { sku: string; requested: number; available: number }[] = [];
  const reservedSkus = new Set<string>();
  const byWarehouse = new Map<number, { sku: string; qty: number }[]>();
  for (const item of wantOwn) {
    const src = planBySku.get(item.sku);
    if (!src) continue;
    if (!byWarehouse.has(src.warehouse_id)) byWarehouse.set(src.warehouse_id, []);
    byWarehouse.get(src.warehouse_id)!.push({ sku: item.sku, qty: item.qty });
  }
  for (const [warehouseId, whItems] of byWarehouse) {
    const res = await createReservation({ order_id: id, warehouse_id: warehouseId, items: whItems, expires_at: expiresAt });
    res.reserved.forEach(r => reservedSkus.add(r.sku));
    insufficient.push(...res.insufficient);
  }

  // Що не вдалось зарезервувати — фактично лишається за постачальником
  const finalOwn = items.filter(i => reservedSkus.has(i.sku));
  const finalDropship = items.filter(i => !reservedSkus.has(i.sku));

  // ── Перебудова ЗП постачальнику ────────────────────────────────────────────
  const draftPoIds = (linkedPos ?? []).map(p => p.id);
  if (draftPoIds.length) {
    await db.from('acc_documents').update({ status: 'cancelled' }).in('id', draftPoIds);
  }

  const fulfillmentMode = finalDropship.length === 0 ? 'own'
    : finalOwn.length === 0 ? 'supplier'
    : 'mixed';

  // ЗП створюємо лише для змішаного виконання — так само, як проведення:
  // при чистому «постачальник» замовлення йде без складських операцій, а ЗП
  // за потреби роблять окремо («Замовити постачальнику»). Без цієї умови
  // повернення всіх позицій на постачальника плодило б зайві чернетки ЗП.
  let purchaseOrderId: string | undefined;
  if (fulfillmentMode === 'mixed') {
    const first = planBySku.get(finalDropship[0].sku);
    const supplierId  = first?.supplier_id ?? null;
    const warehouseId = first?.warehouse_id ?? null;
    if (supplierId && warehouseId) {
      const doc = await createDocument({
        doc_type:     'purchase_order',
        warehouse_id: warehouseId,
        supplier_id:  supplierId,
        order_id:     id,
        notes:        `Замовлення #${order.order_number} — джерело змінено вручну`,
        created_by:   guard.user.email ?? 'admin',
        lines: finalDropship.map(i => ({
          sku:              i.sku,
          qty:              i.qty,
          price:            i.price ?? 0,
          cost_price:       0,
          fulfillment_type: 'dropship' as const,
          supplier_id:      supplierId,
          warehouse_id:     warehouseId,
        })),
      });
      purchaseOrderId = doc.id;
    }
  }

  await db.from('orders').update({ fulfillment_mode: fulfillmentMode }).eq('id', id);

  return NextResponse.json({
    ok: true,
    fulfillment_mode: fulfillmentMode,
    reserved: [...reservedSkus],
    insufficient,
    purchase_order_id: purchaseOrderId ?? null,
  });
}
