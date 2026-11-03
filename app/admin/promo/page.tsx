import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { PROMO } from '../../promo.config';
import PromoSettings from './PromoSettings';
import { createServiceClient } from '../../../lib/supabase-service';
import { requireStaffPage } from '../../../lib/auth-guard';

const serviceClient = createServiceClient();

export default async function PromoPage() {
  await requireStaffPage('admin', 'manager');
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data } = await serviceClient
    .from('app_settings').select('value').eq('key', 'promo_config').single();

  const initial = data?.value ? JSON.parse(data.value) : PROMO;

  return (
    <div style={{ padding: '32px 36px 64px', maxWidth: '640px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Акції та банери</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Керуйте промо-банерами на сайті без зміни коду
        </p>
      </div>
      <PromoSettings initial={initial} />
    </div>
  );
}
