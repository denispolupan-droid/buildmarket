import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';

// План виручки на поточний місяць для віджета «План на місяць» в «Огляді»
// фінансів. Значення одне (app_settings.finance_month_plan): план задається
// на місяць вперед і переписується руками — історія планів тут не потрібна.
export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const value = Number(body.value);
  if (!Number.isFinite(value) || value < 0 || value > 100_000_000) {
    return NextResponse.json({ error: 'Некоректне значення плану' }, { status: 400 });
  }

  const db = createServiceClient();
  const { error } = await db.from('app_settings').upsert({ key: 'finance_month_plan', value: String(Math.round(value)) });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, value: Math.round(value) });
}
