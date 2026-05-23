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
    const customerName = user.user_metadata?.company_name || user.email || 'Клієнт';

    const { data: newCustomer } = await serviceClient.from('customers').insert({
      auth_user_id: user.id,
      type:         isDropship ? 'dropship_partner' : 'wholesale',
      price_tier:   isDropship ? 'drop' : 'wholesale',
      name:         customerName,
      email:        user.email,
      is_active:    true,
      balance:      0,
      balance_held: 0,
    }).select('id').single();

    // Автоматично створюємо договір за замовчуванням
    if (newCustomer?.id) {
      const year = new Date().getFullYear();
      const contractNumber = `ДГ-${year}-${newCustomer.id.slice(0, 8).toUpperCase()}`;
      await serviceClient.from('customer_contracts').insert({
        contract_number: contractNumber,
        customer_id:     newCustomer.id,
        customer_name:   customerName,
        credit_days:     0,
        credit_limit:    0,
        discount_pct:    0,
        allow_promo:     false,
        price_type:      isDropship ? 'drop' : 'wholesale',
        payment_terms:   isDropship ? 'Передоплата (дропшип)' : 'Передоплата (опт)',
        start_date:      new Date().toISOString().slice(0, 10),
        status:          'active',
        notes:           `Автоматично створено при реєстрації (${role})`,
        created_by:      'system',
      });
    }
  }

  // Якщо партнер вже існує — перевіряємо чи є договір, якщо ні — створюємо
  if (existing) {
    const { count } = await serviceClient
      .from('customer_contracts')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', existing.id)
      .eq('status', 'active');

    if ((count ?? 0) === 0) {
      const isDropship = existing.type === 'dropship_partner';
      const year = new Date().getFullYear();
      const contractNumber = `ДГ-${year}-${existing.id.slice(0, 8).toUpperCase()}`;
      await serviceClient.from('customer_contracts').insert({
        contract_number: contractNumber,
        customer_id:     existing.id,
        customer_name:   user.user_metadata?.company_name || user.email || 'Клієнт',
        credit_days:     0,
        credit_limit:    0,
        discount_pct:    0,
        allow_promo:     false,
        price_type:      isDropship ? 'drop' : 'wholesale',
        payment_terms:   isDropship ? 'Передоплата (дропшип)' : 'Передоплата (опт)',
        start_date:      new Date().toISOString().slice(0, 10),
        status:          'active',
        notes:           `Автоматично створено при вході (${existing.type})`,
        created_by:      'system',
      }).select().maybeSingle();
    }
  }

  return NextResponse.json({ role, customer: existing ?? null });
}
