// Пошук/створення контрагента (customers) для замовлення.
//
// Rozetka/Prom-синки створюють контрагентів, а чекаут сайту — ні: зареєстрований
// клієнт робив замовлення і не з'являвся у довіднику «Контрагенти» (customer_id
// в замовленні лишався null). Цей хелпер закриває розрив єдиним шляхом для всіх
// каналів: матч за auth_user_id → email → телефоном, інакше — новий retail-запис.
//
// Ніколи не кидає: довідник не має права зламати оформлення замовлення.

import { createServiceClient } from './supabase';

export function normalizeCustomerPhone(raw?: string | null): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('380')) return d;
  if (d.length === 10 && d.startsWith('0'))   return `38${d}`;
  if (d.length === 11 && d.startsWith('80'))  return `3${d}`;
  return null;
}

export async function findOrCreateCustomerForOrder(input: {
  contact: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  authUserId?: string | null;
}): Promise<string | null> {
  try {
    const db = createServiceClient();
    const email = input.email?.trim().toLowerCase() || null;
    const normPhone = normalizeCustomerPhone(input.phone);

    let found: { id: string; email: string | null; auth_user_id: string | null; company: string | null } | null = null;

    // 1) Прив'язаний акаунт
    if (input.authUserId) {
      const { data } = await db
        .from('customers')
        .select('id, email, auth_user_id, company')
        .eq('auth_user_id', input.authUserId)
        .maybeSingle();
      found = data ?? null;
    }

    // 2) Email
    if (!found && email) {
      const { data } = await db
        .from('customers')
        .select('id, email, auth_user_id, company')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      found = data ?? null;
    }

    // 3) Телефон (в БД зустрічаються різні формати запису)
    if (!found && normPhone) {
      const variants = [...new Set([normPhone, `+${normPhone}`, input.phone?.trim() ?? ''])].filter(Boolean);
      const { data } = await db
        .from('customers')
        .select('id, email, auth_user_id, company')
        .in('phone', variants)
        .limit(1)
        .maybeSingle();
      found = data ?? null;
    }

    if (found) {
      // Дозаповнюємо відсутні реквізити на картці (не перетираємо існуючі)
      const patch: Record<string, unknown> = {};
      if (!found.email && email)                    patch.email        = email;
      if (!found.auth_user_id && input.authUserId)  patch.auth_user_id = input.authUserId;
      if (!found.company && input.company?.trim())  patch.company      = input.company.trim();
      if (Object.keys(patch).length) {
        await db.from('customers').update(patch).eq('id', found.id);
      }
      return found.id;
    }

    const { data: created, error } = await db
      .from('customers')
      .insert({
        name:          input.contact,
        company:       input.company?.trim() || null,
        phone:         normPhone ?? input.phone?.trim() ?? null,
        email,
        auth_user_id:  input.authUserId ?? null,
        type:          'retail',
        price_tier:    'retail',
        is_active:     true,
        orders_count:  0,
        total_revenue: 0,
        balance:       0,
        balance_held:  0,
        meta:          {},
      })
      .select('id')
      .single();
    if (error) {
      console.error('[customers] create failed:', error.message);
      return null;
    }
    return created?.id ?? null;
  } catch (err) {
    console.error('[customers] findOrCreate failed:', err);
    return null;
  }
}
