import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { syncDraftShipmentTracking } from '../../../../lib/accounting/completion';

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

// Розбираємо вільний рядок адреси "вул. Калинова, 104, кв. 5" → { street, house, flat }
function parseAddress(raw: string): { street: string; house: string; flat: string } {
  let s = (raw || '').trim();
  const flatM = s.match(/(?:кв\.?|квартира|apt\.?)\s*([0-9]+[а-яіїєґa-z]?)/i);
  const flat = flatM?.[1] ?? '';
  if (flatM?.index != null) s = s.slice(0, flatM.index).replace(/[,\s]+$/, '');
  const houseM = s.match(/(\d+[а-яіїєґa-z]?(?:\s*\/\s*\d+[а-яіїєґa-z]?)?)\s*$/i);
  const house = houseM?.[1]?.replace(/\s+/g, '') ?? '';
  if (houseM?.index != null) s = s.slice(0, houseM.index).replace(/[,\s]+$/, '');
  const street = s
    .replace(/^(вул\.?|вулиця|просп\.?|проспект|пров\.?|провулок|бул\.?|бульвар|пл\.?|площа|наб\.?|набережна|ш\.?|шосе)\s+/i, '')
    .replace(/[,\s]+$/, '').trim();
  return { street, house, flat };
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
    weight, seatsAmount, cost, description,
    serviceType, payerType, paymentMethod,
    codEnabled, codAmount,
    dimensions,
  } = body;

  const resolvedServiceType = serviceType ?? 'WarehouseWarehouse';
  // Кількість місць: захист від 0/NaN/від'ємного — НП на такому падає з
  // невиразною помилкою, і менеджер бачить «Помилка створення ТТН».
  const seatCount = Math.max(1, Math.floor(Number(seatsAmount) || 1));

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
  let settlementStreetRef = '';
  let parsedHouse = '';
  let parsedFlat = '';
  if (needAddress) {
    const { street, house, flat } = parseAddress(recipientAddress);
    if (!street || !house) {
      return NextResponse.json({ error: 'Не вдалося розібрати адресу. Вкажіть вулицю та номер будинку (напр. «вул. Калинова, 104»).' }, { status: 400 });
    }
    parsedHouse = house;
    parsedFlat = flat;
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
    // Address.save очікує StreetRef із city-based getStreet (не SettlementStreetRef із
    // searchSettlementStreets — той дає "Street doesn't exists"). CityRef уже зарезолвили.
    const stRes = await npCall(apiKey, 'Address', 'getStreet', { CityRef: finalCityRecipient, FindByString: street, Limit: 1 });
    settlementStreetRef = stRes?.data?.[0]?.Ref ?? '';
    if (!settlementStreetRef) {
      return NextResponse.json({ error: `Вулицю «${street}» не знайдено в Новій Пошті для цього міста. Перевірте назву вулиці (напр. без «вул.», лише «Калинова»).` }, { status: 400 });
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
      StreetRef:       settlementStreetRef,
      BuildingNumber:  parsedHouse,
      Flat:            parsedFlat,
    });
    if (!aRes.success || !aRes.data?.[0]?.Ref) {
      return NextResponse.json({ error: aRes.errors?.join('; ') ?? 'Не вдалося створити адресу одержувача у НП' }, { status: 400 });
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

  if (dimensions?.width && dimensions?.height && dimensions?.length) {
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

  // Step 3: Save TTN + Ref to order (status unchanged — changes only on confirm)
  await serviceClient
    .from('orders')
    .update({ tracking_number: ttn, tracking_ref: ref ?? null })
    .eq('id', orderId);
  // Непроведені РН замовлення мають їхати з тим самим номером — інакше крон
  // доставки їх не знайде і продаж ніколи не проведеться.
  await syncDraftShipmentTracking(orderId, ttn);

  return NextResponse.json({ ttn, ref });
}
