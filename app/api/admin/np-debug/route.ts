import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

async function npCall(modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: process.env.NOVA_POSHTA_API_KEY, modelName, calledMethod, methodProperties }),
  });
  return res.json();
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const counterparties = await npCall('Counterparty', 'getCounterparties', { CounterpartyProperty: 'Sender', Page: '1' });
  const sender = counterparties.data?.[0];

  const contacts = sender ? await npCall('ContactPerson', 'getContactPersonsList', { CounterpartyRef: sender.Ref, Page: '1' }) : null;
  const addresses = sender ? await npCall('Counterparty', 'getCounterpartyAddresses', { Ref: sender.Ref, CounterpartyProperty: 'Sender' }) : null;
  const warehousesByCityRef = sender ? await npCall('Address', 'getWarehouses', { CityRef: sender.City, Limit: '5', Page: '1' }) : null;
  const warehousesBySettRef = sender ? await npCall('Address', 'getWarehouses', { SettlementRef: sender.City, Limit: '5', Page: '1' }) : null;

  return NextResponse.json({
    sender,
    contacts: contacts?.data,
    addresses: addresses?.data,
    warehousesByCityRef: warehousesByCityRef?.data?.slice(0, 3),
    warehousesBySettRef: warehousesBySettRef?.data?.slice(0, 3),
  });
}
