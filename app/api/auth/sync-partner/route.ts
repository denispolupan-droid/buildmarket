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

  if (role !== 'dropship' && role !== 'wholesale') {
    return NextResponse.json({ role });
  }

  const { data: existing } = await serviceClient
    .from('customers')
    .select('id, is_active, balance, type')
    .eq('auth_user_id', user.id)
    .single();

  if (!existing) {
    const isDropship = role === 'dropship';
    await serviceClient.from('customers').insert({
      auth_user_id: user.id,
      type:         isDropship ? 'dropship_partner' : 'wholesale',
      price_tier:   isDropship ? 'drop' : 'wholesale',
      name:         user.user_metadata?.company_name || user.email || 'Клієнт',
      email:        user.email,
      is_active:    true,
      balance:      0,
      balance_held: 0,
    });
  }

  return NextResponse.json({ role, customer: existing ?? null });
}
