import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const {
    name, company, legal_name, tax_number,
    phone, email, city, address, legal_address,
    bank_name, bank_iban, bank_mfo,
    type = 'retail', price_tier,
    credit_limit, payment_terms_days,
    notes,
  } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Назва обов\'язкова' }, { status: 400 });

  const { data, error } = await db.from('customers').insert({
    name:                name.trim(),
    company:             company?.trim()       || null,
    legal_name:          legal_name?.trim()    || null,
    tax_number:          tax_number?.trim()    || null,
    phone:               phone?.trim()         || null,
    email:               email?.trim()         || null,
    city:                city?.trim()          || null,
    address:             address?.trim()       || null,
    legal_address:       legal_address?.trim() || null,
    bank_name:           bank_name?.trim()     || null,
    bank_iban:           bank_iban?.trim()     || null,
    bank_mfo:            bank_mfo?.trim()      || null,
    type,
    price_tier:          price_tier ?? type,
    credit_limit:        credit_limit  ? Number(credit_limit)        : null,
    payment_terms_days:  payment_terms_days ? Number(payment_terms_days) : null,
    notes:               notes         || null,
    is_active:           true,
    orders_count:        0,
    total_revenue:       0,
    balance:             0,
    balance_held:        0,
    meta:                {},
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
