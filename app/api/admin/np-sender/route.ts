import { NextResponse } from 'next/server';
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

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: rows } = await serviceClient.from('app_settings').select('key, value');
  const cfg: Record<string, string> = {};
  (rows ?? []).forEach(r => { cfg[r.key] = r.value; });

  // API key: app_settings takes priority over env var
  const apiKey      = cfg.np_api_key || process.env.NOVA_POSHTA_API_KEY || '';
  const cityRef     = cfg.np_sender_city_ref     || process.env.NP_SENDER_CITY_REF     || '';
  const senderType  = (cfg.np_sender_type as 'warehouse' | 'address') ?? 'warehouse';
  const warehouseRef  = cfg.np_sender_warehouse_ref  || process.env.NP_SENDER_WAREHOUSE_REF  || '';
  const warehouseDesc = cfg.np_sender_warehouse_desc || '';
  const addressRef  = cfg.np_sender_address_ref  ?? '';
  const addressDesc = cfg.np_sender_address_desc ?? '';

  if (!apiKey) return NextResponse.json({ error: 'API ключ НП не налаштовано' }, { status: 404 });
  if (!cityRef) return NextResponse.json({ error: 'Місто відправника не налаштовано. Перейдіть у Налаштування.' }, { status: 404 });
  if (senderType === 'warehouse' && !warehouseRef) return NextResponse.json({ error: 'Відділення відправника не налаштовано. Перейдіть у Налаштування.' }, { status: 404 });
  if (senderType === 'address' && !addressRef) return NextResponse.json({ error: 'Адреса забору не налаштована. Перейдіть у Налаштування.' }, { status: 404 });

  // Auto-fetch sender ref + contact + phone from NP API
  const counterRes = await npCall(apiKey, 'Counterparty', 'getCounterparties', { CounterpartyProperty: 'Sender', Page: '1' });
  const sender = counterRes.data?.[0];

  if (!sender) return NextResponse.json({ error: 'Відправника не знайдено в НП. Перевірте API ключ.' }, { status: 404 });

  const contactsRes = await npCall(apiKey, 'ContactPerson', 'getContactPersonsList', { CounterpartyRef: sender.Ref, Page: '1' });
  const contact = contactsRes.data?.[0];

  return NextResponse.json({
    ref:         sender.Ref,
    cityRef,
    contactRef:  contact?.Ref ?? sender.Ref,
    phone:       contact?.Phones ?? contact?.Phone ?? sender.Phone ?? '',
    senderType,
    addressRef,
    addressDesc,
    warehouses: warehouseRef ? [{
      ref:         warehouseRef,
      cityRef,
      description: warehouseDesc || 'Відділення відправника',
      number:      '',
    }] : [],
  });
}
