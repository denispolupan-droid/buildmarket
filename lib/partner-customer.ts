import type { User } from '@supabase/supabase-js';
import { createServiceClient } from './supabase';

/**
 * Контрагент і договір за замовчуванням для партнера (опт / дропшип).
 *
 * Раніше та сама логіка жила двічі — у /auth/callback (без договору) і в
 * /api/auth/sync-partner (з договором). Тепер єдине місце; викликається при
 * вході схваленого партнера і в момент схвалення заявки адміном
 * (/api/admin/b2b-requests, міграція 146). Ідемпотентна.
 */
export async function ensurePartnerCustomer(
  user: Pick<User, 'id' | 'email' | 'user_metadata'>,
  role: 'dropship' | 'wholesale',
): Promise<{ id: string } | null> {
  const db = createServiceClient();
  const isDropship = role === 'dropship';
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const customerName = meta.contact_person || meta.company_name || user.email || 'Клієнт';

  const { data: existing } = await db
    .from('customers')
    .select('id, type')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  let customerId = existing?.id as string | undefined;
  if (!customerId) {
    const { data: created, error } = await db.from('customers').insert({
      auth_user_id: user.id,
      type:         isDropship ? 'dropship_partner' : 'wholesale',
      price_tier:   isDropship ? 'drop' : 'wholesale',
      name:         customerName,
      company:      meta.company_name || null,
      phone:        meta.phone || null,
      city:         meta.city || null,
      tax_number:   meta.tax_number || null,
      email:        user.email,
      is_active:    true,
      balance:      0,
      balance_held: 0,
    }).select('id').single();
    if (error) throw new Error(error.message);
    customerId = created.id as string;
  }

  const { count } = await db
    .from('customer_contracts')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('status', 'active');

  if ((count ?? 0) === 0) {
    const contractDropship = existing ? existing.type === 'dropship_partner' : isDropship;
    await db.from('customer_contracts').insert({
      contract_number: `ДГ-${new Date().getFullYear()}-${customerId.slice(0, 8).toUpperCase()}`,
      customer_id:     customerId,
      customer_name:   customerName,
      credit_days:     0,
      credit_limit:    0,
      discount_pct:    0,
      allow_promo:     false,
      price_type:      contractDropship ? 'drop' : 'wholesale',
      payment_terms:   'prepay',
      start_date:      new Date().toISOString().slice(0, 10),
      status:          'active',
      notes:           `Автоматично створено для партнера (${role})`,
      created_by:      'system',
      is_auto:         true,
    });
  }

  return { id: customerId };
}

/** Тип акаунта з заявки → роль кабінету (як у lib/user-role). */
export function roleForAccountType(type: string | null | undefined): 'dropship' | 'wholesale' | null {
  if (type === 'dropship') return 'dropship';
  if (type && ['dealer', 'contractor', 'shop_owner', 'wholesale'].includes(type)) return 'wholesale';
  return null;
}
