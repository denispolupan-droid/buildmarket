import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { createSaleDraft } from '../../../../../../lib/accounting/dropship';
import { completeOrderDelivery } from '../../../../../../lib/accounting/completion';
import { recordMarketplaceServiceFee } from '../../../../../../lib/accounting/money';
import { computeSmartFee, getSmartTariff } from '../../../../../../lib/rozetka-smart';
import { resolveRozetkaDeliveryFee, getRozetkaDeliveryTariff } from '../../../../../../lib/rozetka-delivery-fee';
import { ROZETKA_DELIVERY_TYPE } from '../../../../../../lib/rozetka-delivery';
import { alertAdmin } from '../../../../../../lib/alert';
import { checkOrderCredit } from '../../../../../../lib/accounting/credit-guard';
import { setPromTTN } from '../../../../../../lib/prom-api';
import { orderItemSources, modeFromSources } from '../../../../../../lib/orders/item-sources';
import { pickupWithTtnError } from '../../../../../../lib/orders/ship-guards';
import { ourStatusToRozetkaStatus, setRozetkaOrderStatusChained, rozetkaNeedsTtn } from '../../../../../../lib/rozetka-api';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const lock = { claimed: false, orderId: '' };
  try {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  // Атомарний claim проти паралельної подвійної відгрузки: між SELECT існуючої
  // РН і створенням нової немає блокування, тому два одночасні кліки могли
  // створити дві РН. UPDATE із умовою — атомарний; протухлий лок (2 хв) можна
  // перехопити, якщо попередній запит помер не звільнивши його.
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: claimed } = await db
    .from('orders')
    .update({ ship_lock: new Date().toISOString() })
    .eq('id', id)
    .or(`ship_lock.is.null,ship_lock.lt.${staleBefore}`)
    .select('id')
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json({ error: 'Відгрузка цього замовлення вже виконується' }, { status: 409 });
  }
  lock.claimed = true;
  lock.orderId = id;

  // Кредитний контроль для замовлень з відстрочкою платежу
  const credit = await checkOrderCredit(id);
  if (!credit.ok) {
    return NextResponse.json({ error: credit.reason }, { status: 409 });
  }

  const body = await req.json().catch(() => ({})) as {
    items?: { sku: string; qty: number }[];
    ttn?: string;
  };
  const partialItems = body.items; // undefined = ship everything
  const bodyTtn = body.ttn?.trim() || null;

  const { data: order, error } = await db
    .from('orders')
    .select('id, order_number, status, items, channel_code, customer_id, delivery_type, prom_order_id, rozetka_order_id, tracking_number, tracking_ref, shipping_supplier_id, total_price, rozetka_data, fulfillment_mode')
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

  // Самовивіз + накладна перевізника = майже напевно не той тип доставки: відвантаження
  // самовивозу одразу проводить продаж і ставить «Доставлено» (кейс #26091002, 01.09.2026).
  // Перевіряємо ДО будь-яких записів — нижче вже зберігається ТТН і створюється РН.
  const pickupConflict = pickupWithTtnError(order, bodyTtn);
  if (pickupConflict) {
    return NextResponse.json({ error: pickupConflict }, { status: 409 });
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

  // ── Варіант 3: при відгрузці створюємо РН-ЧЕРНЕТКУ (НЕ проводимо), резерв ТРИМАЄМО.
  // Проводка (виручка/COGS/склад/комісія + зняття резерву) — при доставці посилки
  // (крон НП / ручне «Виконано»). Пікап = передано клієнту одразу → проводимо тут.

  // Скільки кожного SKU вже включено в не-скасовані РН цього замовлення (щоб не задвоїти
  // при частковій відгрузці та ретраях).
  // Сторно-РН (reversal_of) не рахуємо: їхні рядки від'ємні, і після скасування
  // помилкового відвантаження «вже відвантажено» ставало −1, а діалог пропонував
  // відвантажити 2 шт замість 1 (кейс #26091002, 01.09.2026).
  const { data: existingDocs } = await db
    .from('acc_documents')
    .select('id')
    .eq('order_id', id)
    .eq('doc_type', 'sale')
    .neq('status', 'cancelled')
    .is('reversal_of', null);
  const existingDocIds = (existingDocs ?? []).map(d => d.id);
  const draftedBySku: Record<string, number> = {};
  if (existingDocIds.length) {
    const { data: dl } = await db
      .from('acc_document_lines')
      .select('sku, qty')
      .in('document_id', existingDocIds);
    for (const l of dl ?? []) draftedBySku[l.sku] = (draftedBySku[l.sku] ?? 0) + Number(l.qty);
  }

  // Позиції цієї посилки: запитані (partial) або всі; обрізаємо по залишку замовлення.
  const shipItems = itemsToShip
    .map(i => {
      const orderQty = allOrderItems.find(o => o.sku === i.sku)?.qty ?? i.qty;
      const already  = draftedBySku[i.sku] ?? 0;
      const want     = partialItems ? i.qty : orderQty;
      return { ...i, qty: Math.max(0, Math.min(want, orderQty - already)) };
    })
    .filter(i => i.qty > 0);

  if (shipItems.length === 0) {
    const coveredByDrafts = allOrderItems.every(i => (draftedBySku[i.sku] ?? 0) >= i.qty);
    if (!coveredByDrafts) {
      return NextResponse.json({ error: 'Всі позиції замовлення вже відвантажені' }, { status: 409 });
    }

    // Чернетки покривають усе замовлення — лишається привести статус у
    // відповідність і донести номер у маркетплейс, як після звичайної відгрузки.
    const reTtn = bodyTtn ?? (order.tracking_number as string | null) ?? null;
    const reIsPickup = (order as { delivery_type?: string }).delivery_type === 'pickup';
    const reStatus = reIsPickup ? 'delivered' : 'shipped';
    const reNow = new Date().toISOString();
    if (reIsPickup) await completeOrderDelivery(order.id, user.email ?? 'admin');
    await db.from('orders').update({
      status: reStatus,
      shipped_at: reNow,
      ...(reIsPickup ? { delivered_at: reNow } : {}),
    }).eq('id', id);

    const rePromId = order.prom_order_id as number | null;
    if (rePromId && reTtn) {
      setPromTTN(rePromId, reTtn, (order.delivery_type as string | null) ?? 'nova_poshta')
        .catch(err => console.warn('[ship] setPromTTN failed (re-ship):', err));
    }
    const reRozId = order.rozetka_order_id as number | null;
    const reRozStatus = reRozId ? ourStatusToRozetkaStatus(reStatus) : null;
    if (reRozId && reRozStatus) {
      const cabinet = (order.rozetka_data as Record<string, unknown> | null) ?? {};
      setRozetkaOrderStatusChained(reRozId, reRozStatus, {
        ...(reTtn ? { ttn: reTtn } : {}),
        currentStatus: typeof cabinet.status === 'number' ? cabinet.status : null,
      }).catch(err => console.warn('[ship] setRozetkaOrderStatus failed (re-ship):', err));
    }

    return NextResponse.json({
      ok: true,
      fully_shipped: true,
      status: reStatus,
      reused_drafts: true,
      shipped_items: allOrderItems.map(i => ({ sku: i.sku, qty: i.qty })),
    });
  }

  // contract_id для orders (якщо ще не проставлено)
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

  const effectiveTtn = bodyTtn ?? (order.tracking_number as string | null) ?? null;

  const saleDocId = await createSaleDraft({
    order_id:             order.id,
    order_number:         order.order_number,
    order_items:          shipItems,
    channel_code:         order.channel_code ?? 'website',
    confirmed_by:         user.email ?? 'admin',
    customer_id:          order.customer_id ?? undefined,
    business_date:        new Date().toISOString().split('T')[0],
    shipping_supplier_id: (order as { shipping_supplier_id?: number | null }).shipping_supplier_id ?? null,
    tracking_number:      effectiveTtn,
  });

  // Компенсація Rozetka Smart: площадка списує збір з балансу при передачі посилки
  // перевізникові — проводимо одразу при відгрузці за чинним тарифом (адмінка →
  // «Умови Smart»). Разово на замовлення (order-level ключ; completion при доставці
  // використовує той самий ключ як страховку). Помилка проводки не валить відгрузку.
  const isSmartOrder = order.channel_code === 'rozetka'
    && Boolean((order.rozetka_data as Record<string, unknown> | null)?.is_smart);
  if (isSmartOrder) {
    try {
      const orderTotal = Number(order.total_price) || 0;
      const smartFee = computeSmartFee(orderTotal, await getSmartTariff());
      if (smartFee > 0) {
        await recordMarketplaceServiceFee({
          orderId:        order.id,
          amount:         smartFee,
          marketplace:    'rozetka',
          description:    `Rozetka Smart — компенсація доставки (замовлення #${order.order_number})`,
          idempotencyKey: `smart-fee:rozetka:${order.id}`,
          businessDate:   new Date().toISOString().split('T')[0],
          createdBy:      user.email ?? 'admin',
          meta:           { smart: true, order_total: orderTotal },
        });
      }
    } catch (err) {
      alertAdmin(`Smart-збір Rozetka не записався при відгрузці (замовлення #${order.order_number})`, err);
    }
  }

  // Доставка в точку видачі Rozetka: організацію видачі відправлення оплачує
  // продавець — 30 грн з ПДВ (49, якщо відправляли з відділення Meest ПОШТА).
  // Rozetka списує це автоматично після передачі перевізникові, але з ОКРЕМОГО
  // логістичного балансу (/balance-logistic): у виписці /balances/search, яку
  // читає звірка комісій, таких списань немає, тож без цієї проводки вартість
  // доставки не потрапляла в облік узагалі. Разово на замовлення, як і Smart;
  // помилка проводки не валить відгрузку.
  // Скільки саме списати — вирішує resolveRozetkaDeliveryFee: Smart-замовлення
  // дають нуль (їхній збір проводить блок вище), інакше береться фактична сума
  // з накладної, а тариф лишається запасним варіантом.
  if ((order as { delivery_type?: string }).delivery_type === ROZETKA_DELIVERY_TYPE) {
    try {
      const cabinet = (order.rozetka_data as Record<string, unknown> | null) ?? {};
      const fee = resolveRozetkaDeliveryFee(
        { isSmart: isSmartOrder, actualPrice: Number(cabinet._rz_delivery_price) },
        await getRozetkaDeliveryTariff(),
      );
      if (fee > 0) {
        await recordMarketplaceServiceFee({
          orderId:        order.id,
          amount:         fee,
          marketplace:    'rozetka',
          description:    `Rozetka Доставка — організація видачі відправлення (замовлення #${order.order_number})`,
          idempotencyKey: `rz-delivery-fee:rozetka:${order.id}`,
          businessDate:   new Date().toISOString().split('T')[0],
          createdBy:      user.email ?? 'admin',
          meta:           { rozetka_delivery: true },
        });
      }
    } catch (err) {
      alertAdmin(`Збір за доставку Rozetka не записався при відгрузці (замовлення #${order.order_number})`, err);
    }
  }

  // Чи все замовлення тепер включене в РН (повна відгрузка)?
  const newDrafted = { ...draftedBySku };
  for (const i of shipItems) newDrafted[i.sku] = (newDrafted[i.sku] ?? 0) + i.qty;
  const fullyShipped = allOrderItems.every(i => (newDrafted[i.sku] ?? 0) >= i.qty);

  const isPickup = (order as { delivery_type?: string }).delivery_type === 'pickup';

  // Пікап — товар передано клієнту одразу: проводимо РН(и) замовлення і delivered.
  if (fullyShipped && isPickup) {
    await completeOrderDelivery(order.id, user.email ?? 'admin');
  }

  const now = new Date().toISOString();
  const finalStatus = fullyShipped ? (isPickup ? 'delivered' : 'shipped') : order.status;
  await db.from('orders').update({
    status: finalStatus,
    ...(fullyShipped ? { shipped_at: now } : {}),
    ...(fullyShipped && isPickup ? { delivered_at: now } : {}),
    ...(orderContractId ? { contract_id: orderContractId } : {}),
  }).eq('id', id);

  // Режим виконання за ФАКТОМ, а не за вибором менеджера при підтвердженні:
  // роутер міг перерішити (товар знайшовся на своєму складі), і тоді посилка
  // їде з двох складів, а журнал показував «Пост.». Позначка «Mix» саме звідси.
  try {
    const sources = await orderItemSources(db, order.id, allOrderItems, order.channel_code);
    const mode = modeFromSources(sources);
    if (mode !== order.fulfillment_mode) {
      await db.from('orders').update({ fulfillment_mode: mode }).eq('id', id);
    }
  } catch (err) {
    // Мітка в журналі не варта зірваної відгрузки
    console.error('[ship] fulfillment_mode recompute failed:', err);
  }

  const { data: saleDoc } = await db
    .from('acc_documents')
    .select('doc_number')
    .eq('id', saleDocId)
    .single();

  // Push TTN to Prom.ua after successful shipment (fire-and-forget — don't fail the response)
  let ttnPushed = false;
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
  let rozetkaWarning: string | null = null;
  if (fullyShipped && rozetkaOrderId) {
    const rozStatus = ourStatusToRozetkaStatus(finalStatus);
    if (rozStatus) {
      // Останній відомий статус кабінету. ТТН тепер їде в Rozetka ще при
      // створенні накладної, тож тут пуш часто повторний — без цієї підказки
      // драбина «полікувала» б відмову переходу кроком назад, на 26.
      const cabinet = (order.rozetka_data as Record<string, unknown> | null) ?? {};
      const cabinetStatus = typeof cabinet.status === 'number' ? cabinet.status : null;

      // Відвантаження без накладної Rozetka не приймає: кабінет так і лишиться
      // «Обробляється менеджером», скільки не пушити. Сказати про це треба саме
      // зараз — менеджер стоїть над замовленням і може внести номер, а не через
      // три доби, коли покупець спитає, чому замовлення «в обробці».
      if (rozetkaNeedsTtn(rozStatus, cabinetStatus, !!effectiveTtn)) {
        rozetkaWarning = 'Замовлення Rozetka відвантажено без ТТН — кабінет залишиться в статусі '
          + '«Обробляється менеджером». Внесіть номер накладної в замовлення, і статус доїде сам '
          + 'протягом 5 хвилин. Якщо покупець забрав сам — закрийте замовлення вручну в кабінеті Rozetka.';
      } else {
        setRozetkaOrderStatusChained(rozetkaOrderId, rozStatus, {
          ...(effectiveTtn ? { ttn: effectiveTtn } : {}),
          currentStatus: cabinetStatus,
        }).catch(err => {
          console.warn('[ship] setRozetkaOrderStatus failed:', err);
        });
      }
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
    rozetka_warning: rozetkaWarning,
  });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message
      : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message)
      : String(err);
    console.error('[ship] unhandled error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (lock.claimed) {
      await createServiceClient().from('orders').update({ ship_lock: null }).eq('id', lock.orderId);
    }
  }
}
