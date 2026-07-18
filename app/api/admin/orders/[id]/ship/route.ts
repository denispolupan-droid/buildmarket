import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { recordDropshipSale } from '../../../../../../lib/accounting/dropship';
import { releaseReservation } from '../../../../../../lib/accounting/reservations';
import { setPromTTN } from '../../../../../../lib/prom-api';
import { ourStatusToRozetkaStatus, setRozetkaOrderStatus } from '../../../../../../lib/rozetka-api';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const body = await req.json().catch(() => ({})) as {
    items?: { sku: string; qty: number }[];
    ttn?: string;
  };
  const partialItems = body.items; // undefined = ship everything
  const bodyTtn = body.ttn?.trim() || null;

  const { data: order, error } = await db
    .from('orders')
    .select('id, order_number, status, items, channel_code, customer_id, delivery_type, prom_order_id, rozetka_order_id, tracking_number')
    .eq('id', id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!['confirmed', 'picking', 'awaiting_stock'].includes(order.status)) {
    return NextResponse.json(
      { error: `Неможливо відвантажити із статусу "${order.status}"` },
      { status: 409 },
    );
  }

  // Determine which items to ship (full or partial)
  const allOrderItems = order.items as { sku: string; qty: number; price: number; name: string; brand: string }[];
  const itemsToShip = partialItems
    ? allOrderItems
        .filter(i => partialItems.some(p => p.sku === i.sku && p.qty > 0))
        .map(i => ({ ...i, qty: partialItems.find(p => p.sku === i.sku)!.qty }))
    : allOrderItems;

  if (itemsToShip.length === 0) {
    return NextResponse.json({ error: 'Немає позицій для відвантаження' }, { status: 400 });
  }

  // Save TTN to DB if provided in body and not already set
  if (bodyTtn && bodyTtn !== order.tracking_number) {
    await db.from('orders').update({ tracking_number: bodyTtn }).eq('id', id);
  }

  // Release reservation BEFORE resolveOrderFulfillment so qty_available reflects actual stock.
  try {
    await releaseReservation(id, 'shipped');
  } catch (err) {
    console.warn('[ship] releaseReservation:', err);
  }

  // Idempotency: cancel any stale draft for this order, then create fresh.
  const { data: existingSale } = await db
    .from('acc_documents')
    .select('id, doc_number, status')
    .eq('order_id', id)
    .eq('doc_type', 'sale')
    .neq('status', 'cancelled')
    .maybeSingle();

  if (existingSale) {
    if (existingSale.status === 'draft') {
      await db
        .from('acc_documents')
        .update({
          status:        'cancelled',
          cancelled_at:  new Date().toISOString(),
          cancelled_by:  user.email ?? 'admin',
          cancel_reason: 'Повторне відвантаження: чернетка скасована автоматично',
        })
        .eq('id', existingSale.id);
      // Fall through to create fresh document
    } else {
      // Already confirmed — idempotent return.
      await db.from('orders').update({
        status:     'shipped',
        shipped_at: new Date().toISOString(),
      }).eq('id', id);
      return NextResponse.json({
        ok:             true,
        sale_doc_id:    existingSale.id,
        sale_doc_number: existingSale.doc_number,
        fully_shipped:  true,
        shipped_items:  itemsToShip.map(i => ({ sku: i.sku, qty: i.qty })),
        status: 'shipped',
      });
    }
  }

  const saleDocId = await recordDropshipSale({
    order_id:      order.id,
    order_number:  order.order_number,
    order_items:   itemsToShip,
    channel_code:  order.channel_code ?? 'website',
    confirmed_by:  user.email ?? 'admin',
    customer_id:   order.customer_id ?? undefined,
    business_date: new Date().toISOString().split('T')[0],
  });

  // Check if all order items are now fully shipped
  const { data: confirmedSaleDocs } = await db
    .from('acc_documents')
    .select('id')
    .eq('order_id', id)
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed');

  const confirmedSaleDocIds = (confirmedSaleDocs ?? []).map(d => d.id);

  const confirmedLines = confirmedSaleDocIds.length > 0
    ? (await db
        .from('acc_document_lines')
        .select('sku, qty, document_id')
        .in('document_id', confirmedSaleDocIds)
      ).data ?? []
    : [];

  const shippedBySkuSum: Record<string, number> = {};
  for (const l of confirmedLines ?? []) {
    shippedBySkuSum[l.sku] = (shippedBySkuSum[l.sku] ?? 0) + Number(l.qty);
  }
  const fullyShipped = allOrderItems.every(i => (shippedBySkuSum[i.sku] ?? 0) >= i.qty);

  const isPickup = (order as { delivery_type?: string }).delivery_type === 'pickup';
  const finalStatus = fullyShipped ? (isPickup ? 'delivered' : 'shipped') : order.status;

  // Підставляємо contract_id в orders якщо ще не проставлено
  let orderContractId: string | null = null;
  if (order.customer_id) {
    const { data: ctr } = await db
      .from('customer_contracts')
      .select('id')
      .eq('customer_id', order.customer_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    orderContractId = ctr?.id ?? null;
  }

  if (fullyShipped) {
    const now = new Date().toISOString();
    await db.from('orders').update({
      status:       finalStatus,
      shipped_at:   now,
      ...(isPickup ? { delivered_at: now } : {}),
      ...(orderContractId ? { contract_id: orderContractId } : {}),
    }).eq('id', id);
  } else if (orderContractId) {
    await db.from('orders').update({ contract_id: orderContractId }).eq('id', id);
  }

  const { data: saleDoc } = await db
    .from('acc_documents')
    .select('doc_number')
    .eq('id', saleDocId)
    .single();

  // Push TTN to Prom.ua after successful shipment (fire-and-forget — don't fail the response)
  let ttnPushed = false;
  const effectiveTtn = bodyTtn ?? (order.tracking_number as string | null);
  const promOrderId = order.prom_order_id as number | null;
  if (promOrderId && effectiveTtn) {
    const deliveryType = (order.delivery_type as string | null) ?? 'nova_poshta';
    setPromTTN(promOrderId, effectiveTtn, deliveryType).then(() => {
      ttnPushed = true;
    }).catch(err => {
      console.warn('[ship] setPromTTN failed:', err);
    });
  }

  // Push status(+TTN) to Rozetka after successful shipment (fire-and-forget)
  const rozetkaOrderId = order.rozetka_order_id as number | null;
  if (fullyShipped && rozetkaOrderId) {
    const rozStatus = ourStatusToRozetkaStatus(finalStatus);
    if (rozStatus) {
      setRozetkaOrderStatus(rozetkaOrderId, rozStatus, effectiveTtn ? { ttn: effectiveTtn } : undefined).catch(err => {
        console.warn('[ship] setRozetkaOrderStatus failed:', err);
      });
    }
  }

  return NextResponse.json({
    ok:              true,
    sale_doc_id:     saleDocId,
    sale_doc_number: saleDoc?.doc_number ?? null,
    fully_shipped:   fullyShipped,
    shipped_items:   itemsToShip.map(i => ({ sku: i.sku, qty: i.qty })),
    status:          finalStatus,
    ttn_pushed:      ttnPushed,
  });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message
      : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message)
      : String(err);
    console.error('[ship] unhandled error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
