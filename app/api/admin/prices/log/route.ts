import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { insertPriceChangeLog } from '../../../../../lib/price-change-log';
import { revertMpEntry, type MpLogEntry } from '../../../../../lib/mp-reprice';

async function getAdmin() {
  const auth = await requireStaff('admin', 'manager');
  return auth.ok ? auth.user : null;
}

export async function POST(req: NextRequest) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const db = createServiceClient();
  const res = await insertPriceChangeLog(db, user.id, { ...body, value: parseFloat(body.value) });
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: res.id });
}

export async function PATCH(req: NextRequest) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id, action } = await req.json();
  const db = createServiceClient();

  if (action === 'cancel') {
    const { error } = await db
      .from('price_change_log')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'pending');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Відкат переоцінки маркетплейсів — логіка в lib/mp-reprice (спільна з кроном
  // автоповернення за датою): націнки «до» зі знімка, null = знову категорійна.
  if (action === 'revert') {
    const { data: entry, error } = await db
      .from('price_change_log')
      .select('id, type, target, status, reverted_at, snapshot, created_at, revert_at')
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!entry) return NextResponse.json({ error: 'Запис не знайдено' }, { status: 404 });

    const res = await revertMpEntry(db, entry as MpLogEntry, user.id, 'manual');
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET() {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createServiceClient();
  const { data, error } = await db
    .from('price_change_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
