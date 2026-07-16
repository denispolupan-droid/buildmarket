import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

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
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const {
    orderId,
    senderRef, senderCityRef, senderWarehouseRef, senderStreet, senderContactRef, senderPhone,
    lastName, firstName, middleName, recipientPhone,
    cityRecipientRef, recipientAddressRef,
    weight, seatsAmount, cost, description,
    serviceType, payerType, paymentMethod,
    codEnabled, codAmount,
    dimensions,
  } = body;

  const resolvedServiceType = serviceType ?? 'WarehouseWarehouse';

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

  // Step 1: Create recipient counterparty
  const cRes = await npCall(apiKey, 'Counterparty', 'save', {
    FirstName: firstName,
    LastName: lastName,
    MiddleName: middleName ?? '',
    Phone: normalizePhone(recipientPhone),
    CounterpartyType: 'PrivatePerson',
    CounterpartyProperty: 'Recipient',
    CityRef: cityRecipientRef,
  });

  if (!cRes.success) {
    return NextResponse.json(
      { error: cRes.errors?.join('; ') ?? 'Помилка створення одержувача у НП' },
      { status: 400 },
    );
  }

  const recipientRef = cRes.data[0].Ref;
  const contactRecipientRef = cRes.data[0].ContactPerson?.data?.[0]?.Ref ?? cRes.data[0].Ref;

  // Step 2: Create TTN
  const ttnPayload: Record<string, unknown> = {
    PayerType: payerType,
    PaymentMethod: paymentMethod,
    DateTime: todayStr(),
    CargoType: 'Cargo',
    Weight: String(weight),
    ServiceType: resolvedServiceType,
    SeatsAmount: String(seatsAmount),
    Description: description,
    Cost: String(cost),
    CitySender: senderCityRef,
    Sender: senderRef,
    SenderAddress: senderWarehouseRef,
    ContactSender: senderContactRef,
    SendersPhone: normalizedSenderPhone,
    CityRecipient: cityRecipientRef,
    Recipient: recipientRef,
    RecipientAddress: recipientAddressRef,
    ContactRecipient: contactRecipientRef,
    RecipientsPhone: normalizePhone(recipientPhone),
  };

  if (dimensions?.width && dimensions?.height && dimensions?.length) {
    ttnPayload.OptionsSeat = [{
      volumetricWidth:  String(Math.round(dimensions.width)),
      volumetricHeight: String(Math.round(dimensions.height)),
      volumetricLength: String(Math.round(dimensions.length)),
      weight:           String(weight),
    }];
  }

  if (codEnabled && codAmount > 0) {
    ttnPayload.BackwardDeliveryData = [{
      PayerType:        'Sender',
      CargoType:        'Money',
      RedeliveryString: String(Math.round(parseFloat(codAmount))),
    }];
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

  return NextResponse.json({ ttn, ref });
}
