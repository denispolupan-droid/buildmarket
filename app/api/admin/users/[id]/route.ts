import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
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
  if (!user || user.user_metadata?.role !== 'admin') return null;
  return user;
}

// DELETE — видалення менеджера (не можна видаляти адмінів)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await assertAdmin();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Захист: не можна видалити самого себе і не можна видаляти адмінів
  if (id === caller.id) {
    return NextResponse.json({ error: 'Не можна видалити свій власний акаунт' }, { status: 400 });
  }

  const db = adminClient();
  const { data: { user }, error: fetchErr } = await db.auth.admin.getUserById(id);
  if (fetchErr || !user) return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });
  if (user.user_metadata?.role === 'admin') {
    return NextResponse.json({ error: 'Не можна видаляти адміністраторів' }, { status: 400 });
  }

  const { error } = await db.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// PATCH — оновлення імені менеджера
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { name } = await req.json() as { name: string };

  const db = adminClient();
  const { error } = await db.auth.admin.updateUserById(id, {
    user_metadata: { name: name?.trim() ?? '' },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
