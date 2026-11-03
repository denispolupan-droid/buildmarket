import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { withApi } from '../../../../../lib/api-handler';

function adminClient() {
  return createServiceClient();
}

async function assertAdmin() {
  const auth = await requireStaff('admin');
  return auth.ok ? auth.user : null;
}

// DELETE — видалення менеджера (не можна видаляти адмінів)
async function _DELETE(
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
  if (user.app_metadata?.role === 'admin') {
    return NextResponse.json({ error: 'Не можна видаляти адміністраторів' }, { status: 400 });
  }

  const { error } = await db.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export const DELETE = withApi('admin/users/[id]', _DELETE);

// PATCH — оновлення імені менеджера
async function _PATCH(
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

export const PATCH = withApi('admin/users/[id]', _PATCH);
