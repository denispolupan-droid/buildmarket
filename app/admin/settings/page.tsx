import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import NpSenderSettings from './NpSenderSettings';
import EmailSettings from './EmailSettings';
import ReservationSettings from './ReservationSettings';
import MarketplaceSyncSettings from './MarketplaceSyncSettings';
import UsersSettings from './UsersSettings';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function SettingsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data: rows } = await serviceClient.from('app_settings').select('key, value');
  const cfg: Record<string, string> = {};
  (rows ?? []).forEach(r => { cfg[r.key] = r.value; });

  return (
    <div style={{ padding: '32px 36px 64px', maxWidth: '640px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Налаштування</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Нова Пошта — конфігурація відправлення</p>
      </div>
      <NpSenderSettings
        initialApiKey={cfg.np_api_key ?? ''}
        initialCityRef={cfg.np_sender_city_ref ?? (process.env.NP_SENDER_CITY_REF ?? '')}
        initialCityName={cfg.np_sender_city_name ?? ''}
        initialSenderType={(cfg.np_sender_type as 'warehouse' | 'address') ?? 'warehouse'}
        initialWarehouseRef={cfg.np_sender_warehouse_ref ?? (process.env.NP_SENDER_WAREHOUSE_REF ?? '')}
        initialWarehouseDesc={cfg.np_sender_warehouse_desc ?? ''}
        initialAddressRef={cfg.np_sender_address_ref ?? ''}
        initialAddressDesc={cfg.np_sender_address_desc ?? ''}
      />
      <EmailSettings
        initialFromEmail={cfg.orders_from_email       ?? 'orders@fixline.com.ua'}
        initialFromName={cfg.orders_from_name         ?? 'FIXLINE'}
        initialAdminEmail={cfg.admin_email            ?? ''}
        initialContactName={cfg.company_contact_name  ?? ''}
        initialContactPhone={cfg.company_contact_phone ?? ''}
        initialExtraSenders={(() => { try { const p = JSON.parse(cfg.extra_senders ?? '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })()}
      />
      <ReservationSettings
        initialTtlDays={parseInt(cfg.reservation_ttl_days ?? '7', 10)}
      />
      <MarketplaceSyncSettings
        initialMinutes={parseInt(cfg.marketplace_sync_interval_min ?? '15', 10)}
      />
      <div style={{ marginTop: '24px' }}>
        <UsersSettings />
      </div>
    </div>
  );
}
