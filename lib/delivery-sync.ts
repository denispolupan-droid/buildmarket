import { createClient } from '@supabase/supabase-js';
import { parseNpDateTime } from './np-datetime';
import { notifyCustomerStatus } from './telegram';
import { setRozetkaOrderStatus, getRozetkaOrderStatusInfo } from './rozetka-api';
import { ROZETKA_DELIVERY_TYPE } from './rozetka-delivery';
import { rozetkaDeliveryPhase } from './rozetka-delivery-status';
import { RZ_DELIVERY_TYPE, rzPhase, rzCarrierAccepted } from './rz-delivery';
import { rzTrackStatuses } from './rz-delivery-api';
import { groupByTracking } from './delivery-tracking';
import { pickReturnTtn, buildReturnTracking } from './np-return-tracking';
import { completeShipmentByTtn, allOrderSalesPosted, settleLegacyCommission } from './accounting/completion';
import { recordTxn } from './accounting/money';
import { notifyParcelEvent } from './notify/parcel';

// Синхронізація руху посилок (НП + точки видачі Rozetka) і супутні проводки.
// Живе в lib, а не в роуті крона, бо викликається З ДВОХ місць: щогодинний крон
// і кнопка «Синхронізувати НП» в адмінці. Доки логіка була копією в кожному роуті,
// адмінська копія відстала від «варіанта 3»: вона ставила замовленню delivered,
// але не проводила РН — звідси порушення інваріанта I7 (доставлені замовлення без
// проведеної видаткової) на #26081005/#26081006/#26081008.

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// NP status codes that mean the parcel was delivered to recipient
const DELIVERED_CODES = new Set(['9', '10', '11']);
// Code 1 is specifically and only "sender created the waybill, hasn't handed it over yet"
// (verified against a live tracking response) — any other code means NP has registered some
// movement on the parcel, i.e. it was actually accepted at the branch/pickup.
const NOT_HANDED_OVER_CODE = '1';
// 7 — «Прибув у відділення»: саме тут покупцю варто написати, а не при кожному
// русі посилки. Перевірено на живому трекінгу (замовлення #26071048).
const ARRIVED_CODE = '7';

export type DeliverySyncResult = { updated: number; accepted: number; checked: number; np: number; rozetka: number; rzOwn: number };

/** actor — хто ініціював синк (`cron:…` або `admin:email`); іде у created_by проводок. */
export async function syncDeliveryStatuses(actor: string): Promise<DeliverySyncResult> {
  // Відвантажені + СКАСОВАНІ, чию посилку НП уже прийняла: після скасування
  // відправлення нікуди не зникає — воно їде назад, і менеджеру треба бачити,
  // де воно зараз («Відмова від отримання» → «Прибув у відділення» вже для
  // повернення). Для скасованих оновлюємо ЛИШЕ текст статусу — жодних проводок
  // і зміни статусу замовлення (див. guard у циклі нижче).
  //
  // Третя гілка — скасовані відправлення в точки видачі Rozetka БЕЗ
  // carrier_accepted_at. Умова «прийнято перевізником» ставиться, поки замовлення
  // ще «shipped», а для цієї доставки трекінг не працював узагалі — тож заявка
  // на повернення (#26071055, «Відмова при отриманні») не потрапляла ні під одну
  // умову й лишалася без кнопок «забрав / залишив». Обмежуємо вікном, щоб вибірка
  // не росла вічно — по created_at, а не по shipped_at: у того самого #26071055
  // shipped_at порожній (замовлення скасували, минаючи нашу відгрузку), і вікно
  // по відгрузці його б не зачепило. Наявність ТТН і так гарантує .not(tracking_number).
  // Дата без часу — щоб двокрапки й крапки ISO-мітки не довелося екранувати у фільтрі PostgREST.
  const returnWindow = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: orders, error } = await serviceClient
    .from('orders')
    .select('id, status, tracking_number, carrier_accepted_at, channel_code, rozetka_order_id, delivery_type, telegram_chat_id, order_number, flags, phone, email, contact, company, rz_payment_fee, rz_delivery_cost, rz_delivery_payer')
    .or([
      'status.eq.shipped',
      'and(status.eq.cancelled,carrier_accepted_at.not.is.null)',
      `and(status.eq.cancelled,delivery_type.eq.${ROZETKA_DELIVERY_TYPE},created_at.gte.${returnWindow})`,
    ].join(','))
    .not('tracking_number', 'is', null);

  if (error || !orders?.length) {
    return { updated: 0, accepted: 0, checked: 0, np: 0, rozetka: 0, rzOwn: 0 };
  }

  // Доставка в точки видачі Rozetka має свої номери («RMP-…») і власне джерело
  // руху посилки — питати про них Нову Пошту безглуздо (вона їх просто не знає,
  // і замовлення назавжди лишалося б у «shipped», а продаж — непроведеним).
  // Третій перевізник — «ROZETKA Доставка» власного договору (замовлення сайту).
  // Номер у неї свій, і Нова Пошта про нього не знає так само, як про «RMP-…»,
  // тому з npOrders він теж має бути виключений — інакше замовлення назавжди
  // застрягне у «shipped» з непроведеним продажем.
  const npOrders = orders.filter(o =>
    o.delivery_type !== ROZETKA_DELIVERY_TYPE && o.delivery_type !== RZ_DELIVERY_TYPE);
  const rzOrders = orders.filter(o => o.delivery_type === ROZETKA_DELIVERY_TYPE);
  const rzOwnOrders = orders.filter(o => o.delivery_type === RZ_DELIVERY_TYPE);

  // NP API allows up to 100 documents per request
  const CHUNK = 100;
  let updated = 0;
  let accepted = 0;

  // Одна ТТН може лежати на КІЛЬКОХ замовленнях: коли клієнт зробив два замовлення,
  // а ми відправили їх однією посилкою. Раніше документ НП шукав своє замовлення
  // через chunk.find(), тобто діставався РІВНО ОДНОМУ з них — другий не отримував ні
  // статусу, ні carrier_accepted_at і при доставці не переходив у «Доставлено»,
  // висячи у «Відвантажено» назавжди. Гірше, що вибірка без ORDER BY повертає рядки
  // в довільному порядку, тож «щасливчик» міг мінятися між прогонами: живий кейс
  // 26081001/26081002 — обидва зі спільною ТТН, але з різними текстами й різним часом
  // синку. Тепер документ розкладаємо на ВСІ замовлення з цим номером.
  const ordersByTtn = groupByTracking(npOrders);
  const ttns = [...ordersByTtn.keys()];

  // Номер зворотної накладної → замовлення, яких вона стосується. Збираємо в
  // основному циклі, а трекаємо одним запитом після нього: окремих накладних
  // мало, а зайвий виклик на кожну — зайва секунда в кроні.
  const returnTtnOrders = new Map<string, string[]>();

  for (let i = 0; i < ttns.length; i += CHUNK) {
    const ttnChunk = ttns.slice(i, i + CHUNK);
    const chunk = ttnChunk.flatMap(t => ordersByTtn.get(t) ?? []);

    const res = await fetch('https://api.novaposhta.ua/v2.0/json/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: process.env.NOVA_POSHTA_API_KEY,
        modelName: 'TrackingDocument',
        calledMethod: 'getStatusDocuments',
        methodProperties: {
          // Номери унікальні: дублікати лише зʼїдали б ліміт у 100 документів на запит.
          Documents: ttnChunk.map(n => ({ DocumentNumber: n })),
        },
      }),
    });

    if (!res.ok) continue;
    const data = await res.json();
    if (!data.success) continue;

    const deliveredIds: string[] = [];
    const acceptedOrders: typeof chunk = [];
    const statusTextUpdates: PromiseLike<unknown>[] = [];
    const now = new Date().toISOString();

    // ТТН → вартість доставки і платник (для проводки витрати при доставці)
    const deliveryByTtn = new Map<string, { cost: number; payer: string }>();

    for (const doc of (data.data ?? [])) {
      const docOrders = ordersByTtn.get(String(doc.Number)) ?? [];
      if (!docOrders.length) continue;
      const code = String(doc.StatusCode);

      // Вартість доставки НП (DocumentCost) і платник (PayerType) — довідково на замовленні;
      // якщо платник Sender, при доставці проведемо як витрату продавця.
      const npCost  = parseFloat(String(doc.DocumentCost ?? '')) || null;
      const npPayer = doc.PayerType ? String(doc.PayerType) : null;
      if (npCost != null && npPayer) deliveryByTtn.set(String(doc.Number), { cost: npCost, payer: npPayer });

      // Час ВРУЧЕННЯ, а не «коли крон побачив». Саме RecipientDateTime — коли
      // одержувач забрав; ActualDeliveryDate — коли посилка приїхала у відділення,
      // і на поштоматах різниця буває в пів дня (11:53 привезли — 20:36 забрали).
      // Обидва поля НП віддає київським рядком без зони (див. lib/np-datetime).
      const handedAt = parseNpDateTime(doc.RecipientDateTime) ?? parseNpDateTime(doc.ActualDeliveryDate);

      if (doc.Status) {
        statusTextUpdates.push(
          serviceClient
            .from('orders')
            .update({
              carrier_status_text: doc.Status, carrier_status_synced_at: now,
              ...(handedAt ? { carrier_delivered_at: handedAt } : {}),
              ...(npCost != null ? { np_delivery_cost: npCost } : {}),
              ...(npPayer ? { np_delivery_payer: npPayer } : {}),
            })
            .in('id', docOrders.map(o => o.id)),
        );
      }

      // Посилка, яку не забрали, їде назад НЕ цією накладною: НП створює нову «на
      // підставі» (CargoReturn), а стара назавжди застигає у «Відмова від
      // отримання». Запам'ятовуємо номер зворотної — рух саме по ній відповідає
      // на питання «де посилка зараз».
      const returnTtn = pickReturnTtn(doc);
      if (returnTtn) returnTtnOrders.set(returnTtn, [
        ...(returnTtnOrders.get(returnTtn) ?? []),
        ...docOrders.map(o => o.id),
      ]);

      for (const order of docOrders) {
        // Скасовані відстежуємо ТІЛЬКИ заради тексту статусу (посилка їде назад).
        // Жодних проводок, «доставлено» чи пушу статусу в МП для них бути не може.
        if (order.status === 'cancelled') continue;

        if (DELIVERED_CODES.has(code)) {
          deliveredIds.push(order.id);
        } else if (code !== NOT_HANDED_OVER_CODE && !order.carrier_accepted_at) {
          acceptedOrders.push(order);
        }

        // Посилка у відділенні — момент, коли покупцю справді треба щось знати.
        // Захист від повторів не тут: notifyParcelEvent столбить кожен канал у
        // базі, тож цей самий код у кожному прогоні крона не породжує повторів.
        if (code === ARRIVED_CODE) {
          notifyParcelEvent(order, 'arrived')
            .catch((err: unknown) => console.error('[sync-delivery-status] notify arrived failed:', order.id, err));
        }
      }
    }

    if (statusTextUpdates.length) await Promise.all(statusTextUpdates);

    if (deliveredIds.length) {
      // Варіант 3: спершу ПРОВОДИМО РН-чернетку доставленої посилки за її ТТН
      // (виручка/COGS/склад + комісія по позиціях; резерв знімається). Ідемпотентно;
      // помилка по одному замовленню не зриває весь батч.
      const trulyDelivered: string[] = [];
      for (const orderId of deliveredIds) {
        const ttn = chunk.find(o => o.id === orderId)?.tracking_number;
        if (!ttn) continue;
        try {
          await completeShipmentByTtn(ttn, actor);
          // Legacy-замовлення (старий потік): донарахувати комісію, якщо чернетки не було.
          await settleLegacyCommission(orderId, actor);
        } catch (err) {
          console.error('[sync-delivery-status] completeShipmentByTtn failed:', orderId, err);
          continue;
        }
        // Доставка за наш рахунок (PayerType=Sender): проводимо витрату продавця.
        // Ключ по ТТН — коректно для мультипосилок; помилка не зриває батч.
        const del = deliveryByTtn.get(ttn);
        if (del && del.payer === 'Sender' && del.cost > 0) {
          try {
            await recordTxn({
              debitAccount:  'logistics',
              creditAccount: 'supplier',
              creditParty:   'np:delivery',
              amount:        del.cost,
              docType:       'delivery_cost',
              orderId,
              description:   `Доставка НП за наш рахунок (ТТН ${ttn})`,
              idempotencyKey: `np-delivery:${ttn}`,
              createdBy:     actor,
            });
          } catch (err) {
            console.error('[sync-delivery-status] delivery expense failed:', ttn, err);
          }
        }
        // delivered ставимо ЛИШЕ коли ВСІ РН замовлення проведені — захист від
        // передчасного delivered при відгрузці кількома посилками.
        if (await allOrderSalesPosted(orderId)) trulyDelivered.push(orderId);
      }

      if (trulyDelivered.length) {
        await serviceClient
          .from('orders')
          .update({ status: 'delivered', delivered_at: new Date().toISOString() })
          .in('id', trulyDelivered);
        updated += trulyDelivered.length;
      }

      // Notify customers via Telegram
      const { data: tgOrders } = await serviceClient
        .from('orders')
        .select('order_number, telegram_chat_id')
        .in('id', trulyDelivered)
        .not('telegram_chat_id', 'is', null);

      for (const o of tgOrders ?? []) {
        if (o.telegram_chat_id) {
          notifyCustomerStatus(o.telegram_chat_id, o.order_number, 'delivered');
        }
      }
    }

    if (acceptedOrders.length) {
      await serviceClient
        .from('orders')
        .update({ carrier_accepted_at: new Date().toISOString() })
        .in('id', acceptedOrders.map(o => o.id));
      accepted += acceptedOrders.length;

      // Момент «посилка поїхала» для покупця — саме приймання перевізником, а не
      // наш клік «відвантажено»: тут ТТН уже точно існує і вже щось відстежує.
      for (const o of acceptedOrders) {
        notifyParcelEvent(o, 'shipped')
          .catch((err: unknown) => console.error('[sync-delivery-status] notify shipped failed:', o.id, err));
      }

      // Upgrade Rozetka's status from 61 (scheduled handover) to 3 (handed to delivery service)
      for (const o of acceptedOrders) {
        if (o.channel_code === 'rozetka' && o.rozetka_order_id) {
          setRozetkaOrderStatus(Number(o.rozetka_order_id), 3, { ttn: o.tracking_number as string }).catch(err =>
            console.error('[sync-delivery-status] rozetka status 3 push failed:', err),
          );
        }
      }
    }
  }

  // ── Де зараз посилка, що їде назад ───────────────────────────────────────
  // Стара накладна після відмови застигла, тому питаємо рух зворотної. Разом із
  // місцем зберігаємо дату, до якої зберігання безкоштовне: після неї НП починає
  // рахувати гроші, а забуте повернення дорожчає мовчки.
  if (returnTtnOrders.size) {
    const returnTtns = [...returnTtnOrders.keys()];
    for (let i = 0; i < returnTtns.length; i += CHUNK) {
      const part = returnTtns.slice(i, i + CHUNK);
      try {
        const res = await fetch('https://api.novaposhta.ua/v2.0/json/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: process.env.NOVA_POSHTA_API_KEY,
            modelName: 'TrackingDocument',
            calledMethod: 'getStatusDocuments',
            methodProperties: { Documents: part.map(n => ({ DocumentNumber: n })) },
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.success) continue;
        const now = new Date().toISOString();
        for (const doc of (data.data ?? [])) {
          const ids = returnTtnOrders.get(String(doc.Number));
          if (!ids?.length) continue;
          const tracking = buildReturnTracking(doc, now);
          if (!tracking) continue;
          await serviceClient
            .from('orders')
            .update({ np_return_tracking: tracking, np_return_ttn: tracking.ttn })
            .in('id', ids);
        }
      } catch (err) {
        console.error('[sync-delivery-status] return tracking failed:', err);
      }
    }
  }

  // ── Доставка в точки видачі Rozetka ──────────────────────────────────────
  // Рух посилки віддзеркалює САМ СТАТУС ЗАМОВЛЕННЯ (81 «Прийнято від продавця»
  // → 3 → 82 «В РЦ» ⇄ 4 «Доставляється» → 5 «Очікує в пункті» → 6 «Виконано»).
  // Назву статусу не вигадуємо — Rozetka віддає її українською в status_data.
  // Штук на день одиниці, тож адресний запит на замовлення дешевший за будь-яку
  // пакетну хитрість. Помилка по одному замовленню не зриває решту.
  for (const o of rzOrders) {
    // Доля повернення вже вирішена менеджером («забрав» / «залишив») — питати
    // Rozetka про цю посилку більше нема сенсу.
    const flags = (o.flags ?? []) as string[];
    if (o.status === 'cancelled' && (flags.includes('return_received') || flags.includes('return_abandoned'))) continue;

    let info: Awaited<ReturnType<typeof getRozetkaOrderStatusInfo>> = null;
    try {
      info = o.rozetka_order_id ? await getRozetkaOrderStatusInfo(Number(o.rozetka_order_id)) : null;
    } catch (err) {
      console.error('[sync-delivery-status] rozetka order fetch failed:', o.rozetka_order_id, err);
    }
    if (!info) continue;

    const phase = rozetkaDeliveryPhase(info.status);
    const carrierAccepted = phase === 'accepted' || phase === 'delivered' || phase === 'returning';

    const patch: Record<string, unknown> = {
      carrier_status_text:        info.title ?? `Статус ${info.status}`,
      carrier_status_synced_at:   new Date().toISOString(),
    };
    if (carrierAccepted && !o.carrier_accepted_at) {
      patch.carrier_accepted_at = new Date().toISOString();
      accepted++;
    }
    await serviceClient.from('orders').update(patch).eq('id', o.id);

    // Для скасованих — тільки текст: посилка їде назад, жодних проводок.
    // Статус у Rozetka тут НЕ пушимо: у цій доставці його веде сама Rozetka.
    if (o.status === 'cancelled' || phase !== 'delivered') continue;

    try {
      await completeShipmentByTtn(o.tracking_number as string, actor);
      await settleLegacyCommission(o.id, actor);
    } catch (err) {
      console.error('[sync-delivery-status] rozetka completeShipment failed:', o.id, err);
      continue;
    }
    // Збір за видачу вже проведено при відгрузці (rz-delivery-fee:…) — тут витрат немає.
    if (!(await allOrderSalesPosted(o.id))) continue;

    await serviceClient
      .from('orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', o.id);
    updated++;
    if (o.telegram_chat_id) notifyCustomerStatus(o.telegram_chat_id, o.order_number, 'delivered');
  }

  // ── «ROZETKA Доставка» власного договору (замовлення сайту) ──────────────
  // На відміну від маркетплейсної гілки вище, тут є нормальний трекінг: статуси
  // питаються пачкою по номерах ЕН (до 100 за запит, чанкінг усередині
  // rzTrackStatuses). Замовлення Rozetka тут немає взагалі — це наші власні,
  // тому жодних пушів статусу в маркетплейс.
  if (rzOwnOrders.length) {
    const byTtn = groupByTracking(rzOwnOrders);
    let tracks: Awaited<ReturnType<typeof rzTrackStatuses>> = [];
    try {
      tracks = await rzTrackStatuses([...byTtn.keys()]);
    } catch (err) {
      console.error('[sync-delivery-status] rz-delivery statuses failed:', err);
    }

    for (const track of tracks) {
      const trackOrders = byTtn.get(track.track_id) ?? [];
      if (!trackOrders.length) continue;
      const code  = track.last_status?.status;
      const phase = rzPhase(code);
      const now   = new Date().toISOString();

      for (const o of trackOrders) {
        const patch: Record<string, unknown> = {
          carrier_status_text:      track.last_status?.status_name ?? code ?? null,
          carrier_status_synced_at: now,
        };
        if (rzCarrierAccepted(code) && !o.carrier_accepted_at) {
          patch.carrier_accepted_at = now;
          accepted++;
        }
        await serviceClient.from('orders').update(patch).eq('id', o.id);

        // Скасовані відстежуємо лише заради тексту: посилка їде назад, і жодних
        // проводок по ній бути не може.
        if (o.status === 'cancelled') continue;

        if (patch.carrier_accepted_at) {
          notifyParcelEvent(o, 'shipped')
            .catch((err: unknown) => console.error('[sync-delivery-status] rz notify shipped failed:', o.id, err));
        }

        // Посилка чекає в точці видачі — момент, коли покупцю справді є що сказати.
        // Повтори столбить сам notifyParcelEvent, тому прапорця в замовленні не треба.
        if (phase === 'at_point') {
          notifyParcelEvent(o, 'arrived')
            .catch((err: unknown) => console.error('[sync-delivery-status] rz notify arrived failed:', o.id, err));
        }

        if (phase !== 'delivered') continue;

        try {
          await completeShipmentByTtn(o.tracking_number as string, actor);
          await settleLegacyCommission(o.id, actor);
        } catch (err) {
          console.error('[sync-delivery-status] rz-delivery completeShipment failed:', o.id, err);
          continue;
        }

        // Комісію за переказ післяплати Rozetka утримує з ПРОДАВЦЯ — це наша
        // витрата навіть тоді, коли саму доставку оплатив покупець. Ключ по ЕН:
        // при об'єднаній посилці проводка має бути одна.
        const fee = Number(o.rz_payment_fee) || 0;
        if (fee > 0) {
          try {
            await recordTxn({
              debitAccount: 'logistics', creditAccount: 'supplier', creditParty: 'rz:delivery',
              amount: fee, docType: 'delivery_cost', orderId: o.id,
              description: `Комісія за переказ післяплати ROZETKA (ЕН ${o.tracking_number})`,
              idempotencyKey: `rz-payment-fee:${o.tracking_number}`,
              createdBy: actor,
            });
          } catch (err) {
            console.error('[sync-delivery-status] rz payment fee failed:', o.tracking_number, err);
          }
        }

        // Доставка за наш рахунок — зараз не наш кейс (платить отримувач), але
        // умову доставки міняють у кабінеті, а не в коді, тож перевіряємо явно.
        const shipCost = Number(o.rz_delivery_cost) || 0;
        if (o.rz_delivery_payer === 'sender' && shipCost > 0) {
          try {
            await recordTxn({
              debitAccount: 'logistics', creditAccount: 'supplier', creditParty: 'rz:delivery',
              amount: shipCost, docType: 'delivery_cost', orderId: o.id,
              description: `Доставка ROZETKA за наш рахунок (ЕН ${o.tracking_number})`,
              idempotencyKey: `rz-delivery:${o.tracking_number}`,
              createdBy: actor,
            });
          } catch (err) {
            console.error('[sync-delivery-status] rz delivery cost failed:', o.tracking_number, err);
          }
        }

        if (!(await allOrderSalesPosted(o.id))) continue;

        await serviceClient
          .from('orders')
          .update({ status: 'delivered', delivered_at: new Date().toISOString() })
          .eq('id', o.id);
        updated++;
        if (o.telegram_chat_id) notifyCustomerStatus(o.telegram_chat_id, o.order_number, 'delivered');
      }
    }
  }

  return {
    updated, accepted, checked: orders.length,
    np: npOrders.length, rozetka: rzOrders.length, rzOwn: rzOwnOrders.length,
  };
}
