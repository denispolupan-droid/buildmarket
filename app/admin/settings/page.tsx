import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import NpSenderSettings from './NpSenderSettings';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function SettingsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: rows } = await serviceClient.from('app_settings').select('key, value');
  const cfg: Record<string, string> = {};
  (rows ?? []).forEach(r => { cfg[r.key] = r.value; });

  return (
    <div style={{ padding: '32px 36px 64px', maxWidth: '680px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Налаштування</h1>
        <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>Конфігурація інтеграцій</p>
      </div>
      <NpSenderSettings
        initialCityRef={cfg.np_sender_city_ref ?? (process.env.NP_SENDER_CITY_REF ?? '')}
        initialCityName={cfg.np_sender_city_name ?? ''}
        initialWarehouseRef={cfg.np_sender_warehouse_ref ?? (process.env.NP_SENDER_WAREHOUSE_REF ?? '')}
        initialWarehouseDesc={cfg.np_sender_warehouse_desc ?? (process.env.NP_SENDER_WAREHOUSE_DESC ?? '')}
        initialPhone={cfg.np_sender_phone ?? (process.env.NP_SENDER_PHONE ?? '')}
      />
    </div>
  );
}
