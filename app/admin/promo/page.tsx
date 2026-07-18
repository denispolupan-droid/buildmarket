import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { PROMO } from '../../promo.config';
import PromoSettings from './PromoSettings';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function PromoPage() {
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
