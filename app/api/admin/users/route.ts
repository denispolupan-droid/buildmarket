import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function assertAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return null;
  return user;
}

// GET — список всіх адмінів і менеджерів
export async function GET() {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = adminClient();
  const { data: { users }, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filtered = (users ?? [])
    .filter(u => ['admin', 'manager'].includes(u.app_metadata?.role ?? ''))
    .map(u => ({
      id:              u.id,
      email:           u.email ?? '',
      role:            u.app_metadata?.role ?? '',
      name:            u.user_metadata?.name ?? u.user_metadata?.full_name ?? '',
      created_at:      u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      invited_at:      (u as unknown as Record<string, unknown>).invited_at ?? null,
    }));

  return NextResponse.json({ users: filtered });
}

// POST — запрошення нового менеджера
export async function POST(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email, name } = await req.json() as { email: string; name?: string };
  if (!email?.includes('@')) return NextResponse.json({ error: 'Невірний email' }, { status: 400 });

  const db = adminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
    data: { name: name?.trim() ?? '' },
    redirectTo: `${appUrl}/admin`,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Роль зберігаємо в app_metadata (пишеться лише service-role ключем; користувач
  // не може змінити її через updateUser — на відміну від user_metadata).
  const { error: roleErr } = await db.auth.admin.updateUserById(data.user.id, {
    app_metadata: { role: 'manager' },
  });
  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    user: { id: data.user.id, email: data.user.email },
  });
}
