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

  // getWarehouses works with CityRef (city ref from getCities, same as Counterparty.City)
  const [contactsRes, warehousesRes] = await Promise.all([
    npCall('ContactPerson', 'getContactPersonsList', {
      CounterpartyRef: sender.Ref,
      Page: '1',
    }),
    npCall('Address', 'getWarehouses', {
      CityRef: sender.City,
      Limit: '200',
      Page: '1',
    }),
  ]);

  const contact = contactsRes.data?.[0];
  // NP stores phone in different fields depending on counterparty type
  const phone: string = sender.Phone || contact?.Phones || contact?.Phone || '';

  type WHRaw = { Ref: string; Description: string; Number: string; CityRef?: string };

  return NextResponse.json({
    ref: sender.Ref,
    cityRef: sender.City,
    contactRef: contact?.Ref ?? sender.Ref,
    phone,
    warehouses: (warehousesRes.data ?? []).map((w: WHRaw) => ({
      ref: w.Ref,
      cityRef: w.CityRef ?? sender.City,
      description: w.Description,
      number: w.Number,
    })),
  });
}
