// Пошук/створення контрагента (customers) для замовлення.
//
// Rozetka/Prom-синки створюють контрагентів, а чекаут сайту — ні: зареєстрований
// клієнт робив замовлення і не з'являвся у довіднику «Контрагенти» (customer_id
// в замовленні лишався null). Цей хелпер закриває розрив єдиним шляхом для всіх
// каналів: матч за auth_user_id → email → телефоном, інакше — новий retail-запис.
//
// Ніколи не кидає: довідник не має права зламати оформлення замовлення.

import { createServiceClient, type Database } from './supabase-service';

export { normalizeCustomerPhone, phoneDigitVariants } from './phone-variants';
import { normalizeCustomerPhone, phoneDigitVariants } from './phone-variants';

/**
 * Найстаріший контрагент із цим номером (у будь-якому записі). Раніше
 * `.maybeSingle()` при двох збігах повертав помилку → null → синк створював
 * ще одного; тепер беремо найдавнішого.
 */
export async function findCustomerIdByPhone(
  db: ReturnType<typeof createServiceClient>,
  phone?: string | null,
): Promise<string | null> {
  const variants = phoneDigitVariants(phone);
  if (!variants.length) return null;
  const { data } = await db
    .from('customers')
    .select('id')
    .in('phone_digits', variants)
    .order('created_at', { ascending: true })
    .limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

// Мапінг типу акаунта сайту (app_metadata.account_type) → тип контрагента.
// Той самий поділ, що в lib/user-role.ts.
function customerTypeFor(accountType?: string | null): { type: string; tier: string } {
  if (accountType === 'dropship') return { type: 'dropship_partner', tier: 'drop' };
  if (['dealer', 'contractor', 'shop_owner', 'wholesale'].includes(accountType ?? '')) {
    return { type: 'wholesale', tier: 'wholesale' };
  }
  return { type: 'retail', tier: 'retail' };
}

export async function findOrCreateCustomerForOrder(input: {
  contact: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  authUserId?: string | null;
  /** app_metadata.account_type залогіненого користувача — визначає тип контрагента */
  accountType?: string | null;
}): Promise<string | null> {
  try {
    const db = createServiceClient();
    const email = input.email?.trim().toLowerCase() || null;
    const normPhone = normalizeCustomerPhone(input.phone);
    const target = customerTypeFor(input.accountType);

    let found: { id: string; email: string | null; auth_user_id: string | null; company: string | null; type?: string | null } | null = null;

    // 1) Прив'язаний акаунт
    if (input.authUserId) {
      const { data } = await db
        .from('customers')
        .select('id, email, auth_user_id, company, type')
        .eq('auth_user_id', input.authUserId)
        .maybeSingle();
      found = data ?? null;
    }

    // 2) Email
    if (!found && email) {
      const { data } = await db
        .from('customers')
        .select('id, email, auth_user_id, company, type')
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
        .select('id, email, auth_user_id, company, type')
        .in('phone', variants)
        .limit(1)
        .maybeSingle();
      found = data ?? null;
    }

    if (found) {
      // Дозаповнюємо відсутні реквізити на картці (не перетираємо існуючі)
      const patch: Database['public']['Tables']['customers']['Update'] = {};
      if (!found.email && email)                    patch.email        = email;
      if (!found.auth_user_id && input.authUserId)  patch.auth_user_id = input.authUserId;
      if (!found.company && input.company?.trim())  patch.company      = input.company.trim();
      // Акаунт каже «опт/дроп», а картка — retail (авто-створена раніше):
      // підвищуємо тип, щоб ціни/договори відповідали реєстрації.
      if (found.type === 'retail' && target.type !== 'retail') {
        patch.type       = target.type;
        patch.price_tier = target.tier;
      }
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
        type:          target.type,
        price_tier:    target.tier,
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
