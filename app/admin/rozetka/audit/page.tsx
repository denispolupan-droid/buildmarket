import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import RozetkaAuditClient from './RozetkaAuditClient';
import { createServiceClient } from '../../../../lib/supabase-service';
import type { ComponentProps } from 'react';
import { requireStaffPage } from '../../../../lib/auth-guard';

export const metadata = { title: 'Аудит назв Rozetka — Адмін' };

const db = createServiceClient();

export default async function RozetkaAuditPage() {
  await requireStaffPage('admin', 'manager');
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data: products } = await db
    .from('products')
    .select('sku, name, rozetka_name, brand, category_slug, color, volume')
    .eq('is_active', true)
    .eq('on_rozetka', true)
    .order('category_slug')
    .order('name');

  const { data: categories } = await db
    .from('categories')
    .select('slug, name');

  return (
    <RozetkaAuditClient
      products={(products ?? []) as ComponentProps<typeof RozetkaAuditClient>['products']}
      categories={categories ?? []}
    />
  );
}
