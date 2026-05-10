import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { getRole } from '../../../../lib/user-role';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = getRole(user);

  // Тільки для дропшиперів створюємо customers запис
  if (role !== 'dropship') return NextResponse.json({ role });

  const { data: existing } = await serviceClient
    .from('customers')
    .select('id, is_active, balance')
    .eq('auth_user_id', user.id)
    .single();

  if (!existing) {
    await serviceClient.from('customers').insert({
      auth_user_id: user.id,
      type:         'dropship_partner',
      price_tier:   'drop',
      name:         user.user_metadata?.company_name || user.email || 'Партнер',
      email:        user.email,
      is_active:    true,
      balance:      0,
      balance_held: 0,
    });
  }

  return NextResponse.json({ role, customer: existing ?? null });
}
