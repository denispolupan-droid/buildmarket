import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { createDocument, confirmDocument, resolveSaleDebitParty } from '../../../../../../lib/accounting/documents';
import { recordTxn, reverseMarketplaceCommission } from '../../../../../../lib/accounting/money';
import { computePromCommission } from '../../../../../../lib/prom-commission';
import { computeRozetkaCommission } from '../../../../../../lib/rozetka-commission';
import { alertAdmin } from '../../../../../../lib/alert';

// Повернення від покупця по замовленню: частковий вибір позицій.
// Створює документ return_in → confirmDocument (restock own-рядків новою FIFO-партією,
// сторно виручки, повернення собівартості), для dropship-рядків додатково реверсує
// борг перед постачальником; опційно фіксує повернення коштів покупцю.

type SaleLine = { sku: string; qty: number; price: number; cost_price: number; fulfillment_type: string | null; supplier_id: number | null };

async function loadReturnableState(db: ReturnType<typeof createServiceClient>, orderId: string) {
  const { data: saleDocs } = await db
    .from('acc_documents')
    .select('id, doc_date')
    .eq('order_id', orderId)
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed')
    .is('reversal_of', null)
    .order('doc_date', { ascending: true });
  const saleIds = (saleDocs ?? []).map(d => d.id);
  // РН-основа для «введення на підставі»: остання РН замовлення
  const lastSaleId: string | null = saleIds.length ? saleIds[saleIds.length - 1] : null;

  const { data: returnDocs } = await db
    .from('acc_documents')
    .select('id')
    .eq('order_id', orderId)
    .eq('doc_type', 'return_in')
    .eq('status', 'confirmed')
    .is('reversal_of', null);
  const returnIds = (returnDocs ?? []).map(d => d.id);

  const saleLines: SaleLine[] = saleIds.length
    ? ((await db.from('acc_document_lines')
        .select('sku, qty, price, cost_price, fulfillment_type, supplier_id')
        .in('document_id', saleIds)).data ?? []) as SaleLine[]
    : [];

  const returnedLines = returnIds.length
    ? ((await db.from('acc_document_lines').select('sku, qty').in('document_id', returnIds)).data ?? [])
    : [];

  // Скільки відвантажено та вже повернуто по кожному SKU
  const state = new Map<string, { shipped: number; returned: number; price: number; cost_price: number; fulfillment_type: string | null; supplier_id: number | null }>();
  for (const l of saleLines) {
    const s = state.get(l.sku) ?? { shipped: 0, returned: 0, price: Number(l.price), cost_price: Number(l.cost_price ?? 0), fulfillment_type: l.fulfillment_type, supplier_id: l.supplier_id };
    s.shipped += Number(l.qty);
    state.set(l.sku, s);
  }
  for (const l of returnedLines) {
    const s = state.get(l.sku);
    if (s) s.returned += Number(l.qty);
  }
  return { state, hasSale: saleIds.length > 0, lastSaleId };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const db = createServiceClient();

  const { state, hasSale } = await loadReturnableState(db, id);
  if (!hasSale) return NextResponse.json({ error: 'Немає підтвердженої РН — повертати нічого' }, { status: 409 });

  const { data: order } = await db.from('orders').select('items').eq('id', id).single();
  const names = new Map(((order?.items ?? []) as { sku: string; name: string; brand?: string }[])
    .map(i => [i.sku, [i.brand, i.name].filter(Boolean).join(' ')]));

  return NextResponse.json({
    items: [...state.entries()].map(([sku, s]) => ({
      sku,
      name: names.get(sku) ?? sku,
      price: s.price,
      shipped: s.shipped,
      returned: s.returned,
      available: Math.max(0, s.shipped - s.returned),
    })).filter(i => i.available > 0 || i.returned > 0),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const db = createServiceClient();

  const body = await req.json().catch(() => ({})) as {
    items?: { sku: string; qty: number }[];
    refund?: { method: 'bank' | 'cash' };
    reason?: string;
  };
  const reqItems = (body.items ?? []).filter(i => i.qty > 0);
  if (!reqItems.length) return NextResponse.json({ error: 'Не обрано позицій' }, { status: 400 });

  const { data: order } = await db
    .from('orders')
    .select('id, order_number, customer_id, channel_code, shipping_supplier_id, items')
    .eq('id', id)
    .single();
  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });

  const { state, hasSale, lastSaleId } = await loadReturnableState(db, id);
  if (!hasSale) return NextResponse.json({ error: 'Немає підтвердженої РН — повертати нічого' }, { status: 409 });

  for (const item of reqItems) {
    const s = state.get(item.sku);
    const available = s ? s.shipped - s.returned : 0;
    if (!s || item.qty > available + 1e-9) {
      return NextResponse.json({ error: `${item.sku}: до повернення доступно ${available}, запитано ${item.qty}` }, { status: 400 });
    }
  }

  const { data: warehouse } = await db.from('warehouses').select('id').eq('is_default', true).single();
  if (!warehouse) return NextResponse.json({ error: 'Немає дефолтного складу' }, { status: 500 });

  const createdBy = auth.user.email ?? 'admin';

  const doc = await createDocument({
    doc_type:     'return_in',
    warehouse_id: warehouse.id,
    parent_doc_id: lastSaleId ?? undefined,
    order_id:     order.id,
    customer_id:  order.customer_id ?? undefined,
    channel_code: order.channel_code ?? 'website',
    notes:        `Повернення від покупця по замовленню #${order.order_number}${body.reason?.trim() ? ` — ${body.reason.trim()}` : ''}`,
    created_by:   createdBy,
    lines: reqItems.map(item => {
      const s = state.get(item.sku)!;
      return {
        sku:              item.sku,
        qty:              item.qty,
        price:            s.price,
        cost_price:       s.cost_price,
        fulfillment_type: (s.fulfillment_type as 'own' | 'dropship' | null) ?? 'own',
        warehouse_id:     warehouse.id,
        supplier_id:      s.supplier_id ?? undefined,
      };
    }),
  });

  await confirmDocument(doc.id, createdBy);

  // Dropship-рядки: товар «повернувся» транзитом постачальнику → реверсуємо борг
  // (DR supplier / CR inventory_asset), дзеркально до recordDropshipSale.
  const dropGroups = new Map<string, number>();
  for (const item of reqItems) {
    const s = state.get(item.sku)!;
    if (s.fulfillment_type !== 'dropship') continue;
    const supplierId = String(s.supplier_id ?? order.shipping_supplier_id ?? '');
    if (!supplierId) continue;
    const cost = s.cost_price * item.qty;
    if (cost <= 0) continue;
    dropGroups.set(supplierId, (dropGroups.get(supplierId) ?? 0) + cost);
  }
  for (const [supplierId, amount] of dropGroups) {
    await recordTxn({
      debitAccount:   'supplier',
      debitParty:     supplierId,
      creditAccount:  'inventory_asset',
      amount,
      docId:          doc.id,
      docType:        'return_in',
      orderId:        order.id,
      description:    `Повернення дропшип: зменшення боргу постачальнику (замовлення #${order.order_number})`,
      idempotencyKey: `dropship-return:${doc.id}:${supplierId}`,
      createdBy,
    });
  }

  // Сторно комісії маркетплейсу по повернених позиціях (площадка повертає комісію
  // за повернений товар). Рахуємо по тих самих позиціях, дзеркально до нарахування.
  if (order.channel_code === 'prom' || order.channel_code === 'rozetka') {
    try {
      const returnedForComm = reqItems.map(i => ({ sku: i.sku, qty: i.qty, price: state.get(i.sku)!.price }));
      let commission = 0;
      if (order.channel_code === 'prom') {
        const { data: settings } = await db.from('app_settings').select('key, value').in('key', ['prom_plan', 'prom_commission_pct']);
        const sMap = new Map((settings ?? []).map(s => [s.key, s.value]));
        commission = (await computePromCommission(returnedForComm, {
          plan: (sMap.get('prom_plan') ?? 'single') as 'single' | 'econom',
          fallbackPct: parseFloat(sMap.get('prom_commission_pct') ?? '3'),
        })).total_commission;
      } else {
        const { data: fb } = await db.from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle();
        commission = (await computeRozetkaCommission(returnedForComm, { fallbackPct: parseFloat(fb?.value ?? '15') })).total_commission;
      }
      if (commission > 0) {
        await reverseMarketplaceCommission({
          orderId:        order.id,
          docId:          doc.id,
          amount:         commission,
          marketplace:    order.channel_code,
          createdBy,
          idempotencyKey: `commission-return:${doc.id}:${order.channel_code}`,
        });
      }
    } catch (err) {
      alertAdmin(`Сторно комісії при поверненні не пройшло (замовлення #${order.order_number})`, err);
    }
  }

  // Повернення коштів покупцю (опційно): DR customer(дебітор) / CR bank|cash
  const returnAmount = reqItems.reduce((sum, item) => sum + state.get(item.sku)!.price * item.qty, 0);
  if (body.refund && returnAmount > 0) {
    const party = await resolveSaleDebitParty(db, { customer_id: order.customer_id, order_id: order.id });
    await recordTxn({
      debitAccount:   'customer',
      debitParty:     party,
      creditAccount:  body.refund.method === 'cash' ? 'cash' : 'bank',
      amount:         returnAmount,
      docId:          doc.id,
      docType:        'refund',
      orderId:        order.id,
      description:    `Повернення коштів покупцю (замовлення #${order.order_number})`,
      idempotencyKey: `refund:${doc.id}`,
      createdBy,
    });
  }

  return NextResponse.json({
    ok: true,
    doc_number: doc.doc_number,
    return_amount: Math.round(returnAmount * 100) / 100,
    refunded: !!body.refund,
  });
}
