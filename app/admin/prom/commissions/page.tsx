import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { parsePromDeliveryTariff, PROM_DELIVERY_TARIFF_KEY } from '../../../../lib/prom-delivery-fee';
import PromCommissionsClient from './PromCommissionsClient';
import { createServiceClient } from '../../../../lib/supabase-service';
import { requireStaffPage } from '../../../../lib/auth-guard';

const db = createServiceClient();

export const metadata = { title: 'Комісії Prom.ua — Адмін' };

export default async function PromCommissionsPage() {
  await requireStaffPage('admin', 'manager');
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const [{ data: categories }, { data: planRow }, { data: tariffRow }] = await Promise.all([
    db.from('categories')
      .select('slug, name, parent_slug, prom_commission_pct, prom_commission_pct_econom, prom_commission_pct_more_sales, prom_commission_pct_turbo, prom_section_url, prom_section_id, prom_section_name, prom_markup_pct')
      .order('parent_slug', { nullsFirst: true })
      .order('name'),
    db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
    db.from('app_settings').select('value').eq('key', PROM_DELIVERY_TARIFF_KEY).maybeSingle(),
  ]);

  const plan = (planRow?.value ?? 'single') as 'single' | 'econom' | 'more_sales' | 'turbo';
  const deliveryTariff = parsePromDeliveryTariff(tariffRow?.value as string | undefined);

  return <PromCommissionsClient categories={categories ?? []} plan={plan} deliveryTariff={deliveryTariff} />;
}
