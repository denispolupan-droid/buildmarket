import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { withApi } from '../../../../lib/api-handler';
import { getNpApiKey } from '../../../../lib/np-api';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

async function npCall(modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: await getNpApiKey(), modelName, calledMethod, methodProperties }),
  });
  return res.json();
}

async function _GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

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

export const GET = withApi('admin/np-debug', _GET);
