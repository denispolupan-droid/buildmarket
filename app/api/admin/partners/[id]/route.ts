import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();

  const allowed = [
    'is_active', 'notes', 'credit_limit', 'payment_terms_days',
    'name', 'company', 'legal_name', 'tax_number',
    'phone', 'email', 'city', 'address', 'legal_address',
    'bank_name', 'bank_iban', 'bank_mfo',
    'signatory_name', 'signatory_position',
    'type', 'price_tier',
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key] === '' ? null : body[key];
  }

  const { error } = await db.from('customers').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
