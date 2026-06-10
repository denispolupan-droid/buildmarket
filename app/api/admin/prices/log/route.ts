import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';

const TYPE_LABEL: Record<string, string> = {
  multiply_cost: '× від собівартості',
  increase_pct:  '% зміна',
  fixed:         'Фіксована ціна',
};

const TARGET_LABEL: Record<string, string> = {
  retail: 'Роздріб',
  unit:   'Опт',
  drop:   'Дроп',
  all:    'Всі',
};

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { type, value, target, is_promo, comment, revert_at, count, snapshot } = body;

  const db = createServiceClient();

  // Save to price_change_log
  const { data: logRow, error } = await db.from('price_change_log').insert({
    user_id:   user.id,
    type,
    value:     parseFloat(value),
    target,
    is_promo:  !!is_promo,
    comment:   comment ?? null,
    revert_at: revert_at ?? null,
    count,
    snapshot,
  }).select('id').single();

  if (error) {
    console.error('[prices/log] insert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create acc_document entry so it appears in accounting section
  const typeStr = TYPE_LABEL[type] ?? type;
  const targetStr = TARGET_LABEL[target] ?? target;
  const pct = type === 'increase_pct' ? '%' : '';
  const notes = [
    `${typeStr}: ${value}${pct} — ${targetStr}`,
    is_promo ? '[Акція]' : null,
    comment ?? null,
  ].filter(Boolean).join(' | ');

  const { data: docNumber } = await db.rpc('next_doc_number', { p_type: 'price_change' });
  if (docNumber) {
    await db.from('acc_documents').insert({
      doc_type:    'price_change',
      doc_number:  docNumber as string,
      status:      'confirmed',
      doc_date:    new Date().toISOString(),
      notes,
      counterparty: `${count ?? 0} товарів`,
      total_amount: 0,
      total_cost:   0,
      meta: { log_id: logRow?.id, is_promo: !!is_promo, revert_at: revert_at ?? null },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from('price_change_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
