import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient, type TableUpdate } from '../../../../lib/supabase-service';
import { withApi } from '../../../../lib/api-handler';

function db() {
  return createServiceClient();
}

async function assertAdmin() {
  const auth = await requireStaff('admin');
  return auth.ok ? auth.user : null;
}

async function _GET() {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await db()
    .from('promo_codes')
    .select('id,code,description,discount_type,discount_value,max_discount_amount,min_order_amount,max_uses,uses_count,valid_from,valid_until,is_active,created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export const GET = withApi('admin/promo-codes', _GET);

async function _POST(req: NextRequest) {
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

export const POST = withApi('admin/promo-codes', _POST);

async function _PATCH(req: NextRequest) {
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
    .from('promo_codes').update(update as TableUpdate<'promo_codes'>).eq('id', id)
    .select('id,code,description,discount_type,discount_value,max_discount_amount,min_order_amount,max_uses,uses_count,valid_from,valid_until,is_active,created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export const PATCH = withApi('admin/promo-codes', _PATCH);

async function _DELETE(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await db().from('promo_codes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const DELETE = withApi('admin/promo-codes', _DELETE);
