import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase-service';
import { withApi } from '../../../../lib/api-handler';

const db = createServiceClient();

async function _POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const {
    name, company, legal_name, tax_number,
    phone, email, city, address, legal_address,
    bank_name, bank_iban, bank_mfo,
    signatory_name, signatory_position,
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
    signatory_name:      signatory_name?.trim()     || null,
    signatory_position:  signatory_position?.trim() || null,
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

export const POST = withApi('admin/partners', _POST);
