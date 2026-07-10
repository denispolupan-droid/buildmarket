import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

function db() {
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

export async function GET() {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await db()
    .from('promo_codes')
    .select('id,code,description,discount_type,discount_value,max_discount_amount,min_order_amount,max_uses,uses_count,valid_from,valid_until,is_active,created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { code, discount_type, discount_value, max_discount_amount, min_order_amount, max_uses, valid_from, valid_until, description } = await req.json();
  if (!code?.trim() || !discount_type || !discount_value)
    return NextResponse.json({ error: 'Невірні дані' }, { status: 400 });
  const { data, error } = await db().from('promo_codes').insert({
    code:                code.trim().toUpperCase(),
    discount_type,
    discount_value:      Number(discount_value),
    max_discount_amount: max_discount_amount ? Number(max_discount_amount) : null,
    min_order_amount:    Number(min_order_amount ?? 0),
    max_uses:            max_uses ? Number(max_uses) : null,
    valid_from:          valid_from || null,
    valid_until:         valid_until || null,
    description:         description || null,
    created_by:          'admin',
  }).select('id,code,description,discount_type,discount_value,max_discount_amount,min_order_amount,max_uses,uses_count,valid_from,valid_until,is_active,created_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (fields.code                !== undefined) update.code                = String(fields.code).trim().toUpperCase();
  if (fields.discount_type       !== undefined) update.discount_type       = fields.discount_type;
  if (fields.discount_value      !== undefined) update.discount_value      = Number(fields.discount_value);
  if (fields.max_discount_amount !== undefined) update.max_discount_amount = fields.max_discount_amount ? Number(fields.max_discount_amount) : null;
  if (fields.min_order_amount    !== undefined) update.min_order_amount    = Number(fields.min_order_amount);
  if (fields.max_uses            !== undefined) update.max_uses            = fields.max_uses ? Number(fields.max_uses) : null;
  if (fields.valid_from          !== undefined) update.valid_from          = fields.valid_from || null;
  if (fields.valid_until         !== undefined) update.valid_until         = fields.valid_until || null;
  if (fields.description         !== undefined) update.description         = fields.description || null;
  if (fields.is_active           !== undefined) update.is_active           = Boolean(fields.is_active);

  const { data, error } = await db()
    .from('promo_codes').update(update).eq('id', id)
    .select('id,code,description,discount_type,discount_value,max_discount_amount,min_order_amount,max_uses,uses_count,valid_from,valid_until,is_active,created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await db().from('promo_codes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
