import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { syncDraftShipmentTracking } from '../../../../lib/accounting/completion';
import { numOrNull, type TtnSnapshot } from '../../../../lib/ttn-snapshot';
import {
  prepareCourierAddress, addressLabel, normalizeHouse,
  type RozetkaDelivery, type PromProviderData,
} from '../../../../lib/np-address';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function npCall(apiKey: string, modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
  });
  return res.json();
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('38')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('8')) return '0' + digits.slice(1);
  return digits;
}

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const {
    orderId,
    senderRef, senderCityRef, senderWarehouseRef, senderStreet, senderContactRef, senderPhone,
    lastName, firstName, middleName, recipientPhone,
    cityRecipientRef, recipientAddressRef, recipientAddress,
    seatsAmount, cost, description,
    serviceType, payerType, paymentMethod,
    codEnabled, codAmount,
    dimensions,
  } = body;
  let { weight } = body;

  // Кілька місць зі своєю вагою й габаритами (вікно — рядок на місце, як у кабінеті НП)
  type SeatOpt = { weight: number; width: number; height: number; length: number };
  const seatsOptions: SeatOpt[] | null = Array.isArray(body.seatsOptions) && body.seatsOptions.length > 0
    ? (body.seatsOptions as Partial<SeatOpt>[]).map(s => ({ weight: Number(s?.weight), width: Number(s?.width), height: Number(s?.height), length: Number(s?.length) }))
    : null;
  if (seatsOptions) {
    if (seatsOptions.length > 50) return NextResponse.json({ error: 'Забагато місць' }, { status: 400 });
    const bad = seatsOptions.findIndex(s => ![s.weight, s.width, s.height, s.length].every(n => Number.isFinite(n) && n > 0));
    if (bad >= 0) return NextResponse.json({ error: `Місце ${bad + 1}: вкажіть вагу і всі три габарити` }, { status: 400 });
    // Вага накладної — сума місць, а не те, що прийшло окремим полем
    weight = Number(seatsOptions.reduce((s, x) => s + x.weight, 0).toFixed(3));
  }

  const resolvedServiceType = serviceType ?? 'WarehouseWarehouse';
  // Кількість місць: захист від 0/NaN/від'ємного — НП на такому падає з
  // невиразною помилкою, і менеджер бачить «Помилка створення ТТН».
  const seatCount = seatsOptions ? seatsOptions.length : Math.max(1, Math.floor(Number(seatsAmount) || 1));

  // API key: app_settings takes priority over env var — same precedence as /api/admin/np-sender,
  // which is what resolved senderRef/senderContactRef/etc. for this same request.
  const { data: keyRow } = await serviceClient.from('app_settings').select('value').eq('key', 'np_api_key').maybeSingle();
  const apiKey = keyRow?.value || process.env.NOVA_POSHTA_API_KEY || '';
  if (!apiKey) {
    return NextResponse.json({ error: 'API ключ НП не налаштовано' }, { status: 400 });
  }

  if (!senderRef) {
    return NextResponse.json(
      { error: 'Не знайдено контрагента-відправника в НП. Перейдіть у Налаштування → НП Відправник і перевірте дані.' },
      { status: 400 },
    );
  }

  const normalizedSenderPhone = normalizePhone(senderPhone);
  if (!normalizedSenderPhone) {
    return NextResponse.json(
      { error: 'Телефон відправника порожній. Перейдіть у Налаштування → НП Відправник.' },
      { status: 400 },
    );
  }

  // Кур'єрська (адресна) доставка одержувачу потребує CityRef (місто), а не SettlementRef —
  // інакше НП відхиляє і Counterparty.save (CityRef), і ТТН (CityRecipient) з "City not found".
  // Резолвимо CityRef + вулицю ДО створення одержувача; адресу-Ref створюємо пізніше (треба CounterpartyRef).
  const recipientIsDoors = resolvedServiceType === 'WarehouseDoors' || resolvedServiceType === 'DoorsDoors';
  const needAddress = recipientIsDoors && !recipientAddressRef && !!recipientAddress;
  let finalCityRecipient: string = cityRecipientRef;
  let streetRef = '';
  let streetLabel = '';
  let streetFromSettlementDirectory = false;
  let parsedHouse = '';
  let parsedFlat = '';
  if (needAddress) {
    // SettlementRef → CityRef. Найнадійніше — CityRef складу цього населеного пункту
    // (те саме, що використовує доставка у відділення). Фолбек — DeliveryCity.
    const whRes = await npCall(apiKey, 'Address', 'getWarehouses', { SettlementRef: cityRecipientRef, Limit: 1, Page: 1 });
    const cityFromWh = whRes?.data?.[0]?.CityRef;
    if (cityFromWh) {
      finalCityRecipient = cityFromWh;
    } else {
      const setRes = await npCall(apiKey, 'Address', 'getSettlements', { Ref: cityRecipientRef, Limit: 1 });
      const deliveryCityRef = setRes?.data?.[0]?.DeliveryCity;
      if (deliveryCityRef) finalCityRecipient = deliveryCityRef;
    }
    if (!finalCityRecipient || finalCityRecipient === cityRecipientRef) {
      return NextResponse.json({ error: 'Не вдалося визначити місто НП для адресної доставки. Оберіть місто зі списку НП у полі «Місто».' }, { status: 400 });
    }

    // Модалка вже показала менеджеру вулицю з довідника НП (/api/admin/np-street-resolve)
    // і передає її сюди — беремо її як є, щоб у накладну пішло рівно те, що він бачив.
    const chosen = body.recipientStreet as { ref?: string; label?: string; kind?: string; house?: string; flat?: string } | undefined;
    if (chosen?.ref && chosen.house) {
      streetRef = chosen.ref;
      streetLabel = chosen.label ?? '';
      parsedHouse = normalizeHouse(String(chosen.house));
      parsedFlat = String(chosen.flat ?? '').trim();
      streetFromSettlementDirectory = chosen.kind === 'settlement';
    } else {
      // Без підказки (стара модалка, мережа) — та сама логіка на сервері:
      // Prom-референси → поля Rozetka → розбір тексту (lib/np-address).
      const { data: ord } = await serviceClient
        .from('orders')
        .select('delivery_city_name, rz:rozetka_data->delivery, pm:prom_data->delivery_provider_data')
        .eq('id', orderId)
        .maybeSingle();
      const prepared = await prepareCourierAddress((m, c, p) => npCall(apiKey, m, c, p), {
        text: recipientAddress,
        cityName: (ord?.delivery_city_name as string | null) ?? null,
        rz: ord?.rz as RozetkaDelivery,
        pm: ord?.pm as PromProviderData,
        settlementRef: cityRecipientRef,
        cityRef: finalCityRecipient,
      });
      if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });
      streetRef = prepared.streetRef;
      streetLabel = prepared.streetLabel;
      parsedHouse = prepared.house;
      parsedFlat = prepared.flat;
      streetFromSettlementDirectory = prepared.kind === 'settlement';
    }
  }

  // Step 1: Create recipient counterparty
  const cRes = await npCall(apiKey, 'Counterparty', 'save', {
    FirstName: firstName,
    LastName: lastName,
    MiddleName: middleName ?? '',
    Phone: normalizePhone(recipientPhone),
    CounterpartyType: 'PrivatePerson',
    CounterpartyProperty: 'Recipient',
    CityRef: finalCityRecipient,
  });

  if (!cRes.success) {
    return NextResponse.json(
      { error: cRes.errors?.join('; ') ?? 'Помилка створення одержувача у НП' },
      { status: 400 },
    );
  }

  const recipientRef = cRes.data[0].Ref;
  const contactRecipientRef = cRes.data[0].ContactPerson?.data?.[0]?.Ref ?? cRes.data[0].Ref;

  // Адресна (кур'єрська) доставка: створюємо адресу-Ref у НП (потрібен CounterpartyRef одержувача,
  // тому — після Step 1). CityRef та вулицю вже зарезолвили вище.
  let finalRecipientAddress: string = recipientAddressRef ?? '';
  if (needAddress) {
    const aRes = await npCall(apiKey, 'Address', 'save', {
      CounterpartyRef: recipientRef,
      StreetRef:       streetRef,
      BuildingNumber:  parsedHouse,
      Flat:            parsedFlat,
    });
    if (!aRes.success || !aRes.data?.[0]?.Ref) {
      const npMsg = aRes.errors?.filter(Boolean).join('; ') || 'Не вдалося створити адресу одержувача у НП';
      // Перевірено наживо 28.10.2026: Ref із довідника населеного пункту (села)
      // Address.save не приймає — «Street doesn't exists», і з CityRef, і без;
      // варіант ЕН «адреса рядком» (NewAddress=1) таку вулицю теж не знаходить.
      // Кажемо прямо: кур'єром через API сюди не виписати.
      const detail = streetFromSettlementDirectory
        ? ` Вулицю «${streetLabel}» НП знає лише в довіднику населеного пункту і через API не приймає її для кур'єрської адреси. Оформіть доставку у відділення або створіть ЕН у кабінеті НП.`
        : '';
      return NextResponse.json({ error: `${npMsg}.${detail}`.replace('..', '.') }, { status: 400 });
    }
    finalRecipientAddress = aRes.data[0].Ref;
  }

  // Step 2: Create TTN
  const ttnPayload: Record<string, unknown> = {
    PayerType: payerType,
    PaymentMethod: paymentMethod,
    DateTime: todayStr(),
    CargoType: 'Cargo',
    Weight: String(weight),
    ServiceType: resolvedServiceType,
    SeatsAmount: String(seatCount),
    Description: description,
    Cost: String(cost),
    CitySender: senderCityRef,
    Sender: senderRef,
    SenderAddress: senderWarehouseRef,
    ContactSender: senderContactRef,
    SendersPhone: normalizedSenderPhone,
    CityRecipient: finalCityRecipient,
    Recipient: recipientRef,
    RecipientAddress: finalRecipientAddress,
    ContactRecipient: contactRecipientRef,
    RecipientsPhone: normalizePhone(recipientPhone),
  };

  if (seatsOptions) {
    ttnPayload.OptionsSeat = seatsOptions.map(s => ({
      volumetricWidth:  String(Math.round(s.width)),
      volumetricHeight: String(Math.round(s.height)),
      volumetricLength: String(Math.round(s.length)),
      weight:           String(s.weight),
    }));
  } else if (dimensions?.width && dimensions?.height && dimensions?.length) {
    // НП очікує в OptionsSeat рівно SeatsAmount елементів — по одному на місце.
    // Один елемент на кілька місць вона приймала як одне, і об'ємна вага
    // рахувалась по одній коробці замість усіх.
    const perSeatWeight = Math.round((Number(weight) / seatCount) * 100) / 100;
    ttnPayload.OptionsSeat = Array.from({ length: seatCount }, () => ({
      volumetricWidth:  String(Math.round(dimensions.width)),
      volumetricHeight: String(Math.round(dimensions.height)),
      volumetricLength: String(Math.round(dimensions.length)),
      weight:           String(perSeatWeight),
    }));
  }

  if (codEnabled && codAmount > 0) {
    // This account uses "Контроль оплати" (NovaPay settlement-account routing) — as of Nova
    // Poshta's 2025 policy, classic cash post-payment via BackwardDeliveryData is no longer
    // available for FOP/legal-entity senders, and sending it alongside payment control causes
    // "Передана послуга Післяплата недоступна". AfterpaymentOnGoodsCost is the documented
    // replacement field (routes the COD sum to the sender's bank account instead of cash).
    ttnPayload.AfterpaymentOnGoodsCost = String(Math.round(parseFloat(codAmount)));
  }

  const ttnRes = await npCall(apiKey, 'InternetDocument', 'save', ttnPayload);

  if (!ttnRes.success) {
    return NextResponse.json(
      { error: ttnRes.errors?.join('; ') ?? 'Помилка створення ТТН у НП' },
      { status: 400 },
    );
  }

  const ttn = ttnRes.data?.[0]?.IntDocNumber;
  const ref = ttnRes.data?.[0]?.Ref;
  if (!ttn) {
    return NextResponse.json(
      { error: 'ТТН не повернуто від API Нової Пошти' },
      { status: 502 },
    );
  }

  // Що вписали в накладну — для вікна «Деталі ЕН» (lib/ttn-snapshot.ts)
  const snapshot: TtnSnapshot = {
    carrier: 'np', ttn: String(ttn), created_at: new Date().toISOString(), created_by: user.email ?? null,
    cod: ttnPayload.AfterpaymentOnGoodsCost ? Number(ttnPayload.AfterpaymentOnGoodsCost) : 0,
    declared: numOrNull(cost),
    weight: numOrNull(weight),
    dims: dimensions?.width && dimensions?.height && dimensions?.length
      ? { length: Number(dimensions.length), width: Number(dimensions.width), height: Number(dimensions.height) } : null,
    places: seatCount,
    seats: seatsOptions,
    payer: payerType ?? null,
    payment_method: paymentMethod ?? null,
    service_type: resolvedServiceType,
    description: description ?? null,
    sender: { phone: normalizedSenderPhone },
    recipient: {
      name: [lastName, firstName, middleName].filter(Boolean).join(' '),
      phone: normalizePhone(recipientPhone),
      // Що реально пішло в НП (вулиця з довідника, будинок, квартира), а не сирий текст
      address: recipientIsDoors ? (streetLabel ? addressLabel(streetLabel, parsedHouse, parsedFlat) : (recipientAddress ?? null)) : null,
    },
  };

  // Step 3: Save TTN + Ref to order (status unchanged — changes only on confirm)
  await serviceClient
    .from('orders')
    .update({ tracking_number: ttn, tracking_ref: ref ?? null, ttn_snapshot: snapshot })
    .eq('id', orderId);
  // Непроведені РН замовлення мають їхати з тим самим номером — інакше крон
  // доставки їх не знайде і продаж ніколи не проведеться.
  await syncDraftShipmentTracking(orderId, ttn);

  return NextResponse.json({ ttn, ref });
}
