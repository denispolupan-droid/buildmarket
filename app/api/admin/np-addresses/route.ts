import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function npCall(modelName: string, calledMethod: string, props: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: process.env.NOVA_POSHTA_API_KEY, modelName, calledMethod, methodProperties: props }),
  });
  return res.json();
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get sender counterparty ref
  const { data: rows } = await serviceClient.from('app_settings').select('key, value');
  const cfg: Record<string, string> = {};
  (rows ?? []).forEach(r => { cfg[r.key] = r.value; });

  const senderRef = cfg.np_sender_ref || process.env.NP_SENDER_REF || '';

  if (!senderRef) {
    // Try auto-fetch
    const counterRes = await npCall('Counterparty', 'getCounterparties', { CounterpartyProperty: 'Sender', Page: '1' });
    const sender = counterRes.data?.[0];
    if (!sender) return NextResponse.json({ addresses: [] });

    const addrRes = await npCall('Counterparty', 'getCounterpartyAddresses', {
      Ref: sender.Ref,
      CounterpartyProperty: 'Sender',
    });
    return NextResponse.json({ addresses: addrRes.data ?? [] });
  }

  const addrRes = await npCall('Counterparty', 'getCounterpartyAddresses', {
    Ref: senderRef,
    CounterpartyProperty: 'Sender',
  });

  return NextResponse.json({ addresses: addrRes.data ?? [] });
}
