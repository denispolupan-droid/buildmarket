import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

  // Read saved sender config from DB
  const { data: rows } = await serviceClient.from('app_settings').select('key, value');
  const cfg: Record<string, string> = {};
  (rows ?? []).forEach(r => { cfg[r.key] = r.value; });

  // Merge: DB takes priority, then env vars
  const cityRef      = cfg.np_sender_city_ref      || process.env.NP_SENDER_CITY_REF      || '';
  const warehouseRef = cfg.np_sender_warehouse_ref  || process.env.NP_SENDER_WAREHOUSE_REF  || '';
  const warehouseDesc = cfg.np_sender_warehouse_desc || process.env.NP_SENDER_WAREHOUSE_DESC || '';

  // Sender ref + contact + phone: try DB, then env, then NP API
  let senderRef    = cfg.np_sender_ref         || process.env.NP_SENDER_REF         || '';
  let contactRef   = cfg.np_sender_contact_ref  || process.env.NP_SENDER_CONTACT_REF  || '';
  let phone        = cfg.np_sender_phone        || process.env.NP_SENDER_PHONE        || '';

  // Always fetch sender/contact/phone from NP API if any are missing
  if (!senderRef || !contactRef || !phone) {
    const counterRes = await npCall('Counterparty', 'getCounterparties', { CounterpartyProperty: 'Sender', Page: '1' });
    const sender = counterRes.data?.[0];
    if (sender) {
      senderRef = senderRef || sender.Ref;
      const contactsRes = await npCall('ContactPerson', 'getContactPersonsList', { CounterpartyRef: sender.Ref, Page: '1' });
      const contact = contactsRes.data?.[0];
      contactRef = contactRef || contact?.Ref || sender.Ref;
      phone      = phone      || contact?.Phones || contact?.Phone || sender.Phone || '';
    }
  }

  if (!cityRef || !warehouseRef) {
    return NextResponse.json(
      { error: 'Не налаштовано відділення відправника. Перейдіть у Налаштування → НП Відправник.' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ref: senderRef,
    cityRef,
    contactRef,
    phone,
    warehouses: [{
      ref: warehouseRef,
      cityRef,
      description: warehouseDesc || 'Відділення відправника',
      number: '',
    }],
  });
}
