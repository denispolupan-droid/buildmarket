import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServer } from './supabase-server';
import { getRole, type UserRole } from './user-role';

// Єдиний auth-гейт для route handlers. Замість того щоб у кожному роуті вручну робити
// getUser() + перевірку ролі (і ризикувати забути її в новому роуті), використовуй ці
// хелпери — вони повертають або { ok:true, user }, або { ok:false, response } з готовою
// відповіддю 401/403.
//
// Приклад (admin API):
//   const auth = await requireStaff();              // тільки admin
//   if (!auth.ok) return auth.response;
//   // ... auth.user
//
//   const auth = await requireStaff('admin', 'manager');
//
// Приклад (кабінет партнера):
//   const auth = await requireCustomer('dropship');
//   if (!auth.ok) return auth.response;

export type StaffRole = 'admin' | 'manager';

type Ok = { ok: true; user: User };
type Err = { ok: false; response: NextResponse };

const unauthorized = (): Err => ({ ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
const forbidden = (): Err => ({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });

/**
 * Гейт для staff-роутів (/api/admin/*). Пускає лише автентифікованих користувачів,
 * у яких app_metadata.role входить у список дозволених (за замовчуванням — тільки 'admin').
 */
export async function requireStaff(...roles: StaffRole[]): Promise<Ok | Err> {
  const allowed: StaffRole[] = roles.length ? roles : ['admin'];
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const role = user.app_metadata?.role as string | undefined;
  if (!role || !allowed.includes(role as StaffRole)) return forbidden();
  return { ok: true, user };
}

/**
 * Той самий гейт, але для server-компонентів сторінок: там немає куди повертати
 * NextResponse, тому недозволена роль просто редіректиться на головну. Потрібен,
 * щоб сторінки адмінки не робили getUser() + перевірку ролі вручну — саме так
 * у розділ і заповзали розбіжності («/admin/seo лише admin, а /api/.../gsc —
 * будь-хто зі staff»).
 *
 *   const user = await requireStaffPage('admin');
 */
export async function requireStaffPage(...roles: StaffRole[]): Promise<User> {
  const allowed: StaffRole[] = roles.length ? roles : ['admin'];
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role as string | undefined;
  if (!user || !role || !allowed.includes(role as StaffRole)) redirect('/');
  return user;
}

/**
 * Гейт за клієнтським типом (app_metadata.account_type → getRole): dropship / wholesale / retail.
 * Пускає лише автентифікованих користувачів із однією з дозволених ролей.
 */
export async function requireCustomer(...roles: UserRole[]): Promise<Ok | Err> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  if (roles.length && !roles.includes(getRole(user))) return forbidden();
  return { ok: true, user };
}
