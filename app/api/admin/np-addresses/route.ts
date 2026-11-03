import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase-service';
import { withApi } from '../../../../lib/api-handler';
import { readSetting } from '../../../../lib/secrets';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const serviceClient = createServiceClient();

async function npCall(apiKey: string, modelName: string, calledMethod: string, props: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties: props }),
  });
  return res.json();
}

async function _GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  // Get sender counterparty ref + API key
  const { data: rows } = await serviceClient.from('app_settings').select('key, value');
  const cfg: Record<string, string> = {};
  (rows ?? []).forEach(r => { cfg[r.key] = r.value; });

  // Ключ НП — лише з Vault (lib/secrets): у app_settings його більше немає, а
  // запасний ключ з env — інший кабінет НП, його відправник не підходить до ТТН
  const apiKey    = (await readSetting(serviceClient, 'np_api_key')) || process.env.NOVA_POSHTA_API_KEY || '';
  const senderRef = cfg.np_sender_ref || process.env.NP_SENDER_REF || '';

  if (!apiKey) return NextResponse.json({ error: 'API ключ НП не налаштовано' }, { status: 404 });

  if (!senderRef) {
    // Try auto-fetch
    const counterRes = await npCall(apiKey, 'Counterparty', 'getCounterparties', { CounterpartyProperty: 'Sender', Page: '1' });
    const sender = counterRes.data?.[0];
    if (!sender) return NextResponse.json({ addresses: [] });

    const addrRes = await npCall(apiKey, 'Counterparty', 'getCounterpartyAddresses', {
      Ref: sender.Ref,
      CounterpartyProperty: 'Sender',
    });
    return NextResponse.json({ addresses: addrRes.data ?? [] });
  }

  const addrRes = await npCall(apiKey, 'Counterparty', 'getCounterpartyAddresses', {
    Ref: senderRef,
    CounterpartyProperty: 'Sender',
  });

  return NextResponse.json({ addresses: addrRes.data ?? [] });
}

export const GET = withApi('admin/np-addresses', _GET);
