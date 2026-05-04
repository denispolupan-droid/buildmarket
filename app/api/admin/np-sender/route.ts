import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

async function npCall(modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.NOVA_POSHTA_API_KEY,
      modelName,
      calledMethod,
      methodProperties,
    }),
  });
  return res.json();
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 1. Get sender counterparty
  const counterRes = await npCall('Counterparty', 'getCounterparties', {
    CounterpartyProperty: 'Sender',
    Page: '1',
  });

  if (!counterRes.success || !counterRes.data?.length) {
    return NextResponse.json(
      { error: 'Не знайдено акаунт відправника у Новій Пошті. Перевірте API ключ.' },
      { status: 404 },
    );
  }

  const sender = counterRes.data[0];

  // 2. Get contacts + sender addresses in parallel
  // getCounterpartyAddresses returns warehouses registered for this sender account
  const [contactsRes, addressesRes] = await Promise.all([
    npCall('ContactPerson', 'getContactPersonsList', {
      CounterpartyRef: sender.Ref,
      Page: '1',
    }),
    npCall('Counterparty', 'getCounterpartyAddresses', {
      Ref: sender.Ref,
      CounterpartyProperty: 'Sender',
    }),
  ]);

  const contact = contactsRes.data?.[0];
  const phone: string = sender.Phone || contact?.Phones || contact?.Phone || '';

  type AddrRaw = { Ref: string; Description: string; CityRef?: string; Number?: string };
  const addresses: AddrRaw[] = addressesRes.data ?? [];

  // CityRef: prefer from address, fallback to sender.City
  const cityRef: string = addresses[0]?.CityRef ?? sender.City ?? '';

  return NextResponse.json({
    ref: sender.Ref,
    cityRef,
    contactRef: contact?.Ref ?? sender.Ref,
    phone,
    warehouses: addresses.map((a: AddrRaw) => ({
      ref: a.Ref,
      cityRef: a.CityRef ?? cityRef,
      description: a.Description,
      number: a.Number ?? '',
    })),
  });
}
