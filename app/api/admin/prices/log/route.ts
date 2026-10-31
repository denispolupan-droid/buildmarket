import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import {
  applyMpMarkups, isMpTarget, loadMpMarkups, mpDriftedSkus, mpRevertItems, type MpSnapshotRow,
} from '../../../../../lib/mp-reprice';

const TYPE_LABEL: Record<string, string> = {
  multiply_cost: '× від собівартості',
  increase_pct:  '% зміна',
  fixed:         'Фіксована ціна',
  set_markup:    'Націнка = N %',
  mp_revert:     'Відкат переоцінки МП',
  manual:        'Ручна правка',
  promo_cancel:  'Завершення акції',
  supplier_discount: 'Знижка постачальника',
};

const TARGET_LABEL: Record<string, string> = {
  retail:  'Роздріб',
  unit:    'Опт',
  drop:    'Дроп',
  all:     'Всі',
  rozetka: 'Rozetka',
  prom:    'Prom',
  mp:      'Prom + Rozetka',
};

async function getAdmin() {
  const auth = await requireStaff('admin', 'manager');
  return auth.ok ? auth.user : null;
}

type LogInput = {
  type: string;
  value: number;
  target: string;
  is_promo?: boolean;
  comment?: string | null;
  revert_at?: string | null;
  effective_from?: string | null;
  status?: string;
  count?: number;
  snapshot?: unknown;
};

/** Рядок журналу + документ «Переоцінка» в обліку. Повертає id рядка або помилку. */
async function insertLogEntry(
  db: ReturnType<typeof createServiceClient>,
  user: User,
  input: LogInput,
): Promise<{ id: number } | { error: string }> {
  const isPending = input.status === 'pending';

  const { data: logRow, error } = await db.from('price_change_log').insert({
    user_id:        user.id,
    type:           input.type,
    value:          Number(input.value),
    target:         input.target,
    is_promo:       !!input.is_promo,
    comment:        input.comment ?? null,
    revert_at:      input.revert_at ?? null,
    effective_from: input.effective_from ?? null,
    status:         isPending ? 'pending' : 'applied',
    count:          input.count ?? null,
    snapshot:       input.snapshot ?? null,
  }).select('id').single();

  if (error || !logRow) {
    console.error('[prices/log] insert error:', error);
    return { error: error?.message ?? 'insert failed' };
  }

  const typeStr   = TYPE_LABEL[input.type] ?? input.type;
  const targetStr = TARGET_LABEL[input.target] ?? input.target;
  const pct = input.type === 'increase_pct' || input.type === 'set_markup' ? '%' : '';
  const notes = [
    input.type === 'mp_revert' ? `${typeStr} — ${targetStr}` : `${typeStr}: ${input.value}${pct} — ${targetStr}`,
    input.is_promo ? '[Акція]'       : null,
    isPending      ? '[Заплановано]' : null,
    input.comment  ?? null,
  ].filter(Boolean).join(' | ');

  const { data: docNumber } = await db.rpc('next_doc_number', { p_type: 'price_change' });
  if (docNumber) {
    await db.from('acc_documents').insert({
      doc_type:    'price_change',
      doc_number:  docNumber as string,
      status:      isPending ? 'draft' : 'confirmed',
      doc_date:    input.effective_from ?? new Date().toISOString(),
      notes,
      counterparty: `${input.count ?? 0} товарів`,
      total_amount: 0,
      total_cost:   0,
      meta: { log_id: logRow.id, is_promo: !!input.is_promo, revert_at: input.revert_at ?? null, effective_from: input.effective_from ?? null },
    });
  }

  return { id: logRow.id as number };
}

export async function POST(req: NextRequest) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const db = createServiceClient();
  const res = await insertLogEntry(db, user, { ...body, value: parseFloat(body.value) });
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

  // Відкат переоцінки маркетплейсів: повертаємо товарні націнки «до» зі знімка.
  // Null у знімку = товар рахувався від націнки категорії — відкат повертає і це,
  // тобто попередній механізм ціноутворення для кожного SKU. Сам рядок позначаємо
  // reverted, а подію пишемо окремим рядком, щоб у журналі було видно обидва.
  if (action === 'revert') {
    const { data: entry, error } = await db
      .from('price_change_log')
      .select('id, type, target, status, reverted_at, snapshot, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!entry) return NextResponse.json({ error: 'Запис не знайдено' }, { status: 404 });
    if (!isMpTarget(entry.target) || entry.type === 'mp_revert') {
      return NextResponse.json({ error: 'Відкат доступний лише для переоцінок маркетплейсів' }, { status: 400 });
    }
    if (entry.status !== 'applied' || entry.reverted_at) {
      return NextResponse.json({ error: 'Цю переоцінку вже відкочено або вона не застосована' }, { status: 409 });
    }

    const snapshot = (entry.snapshot ?? []) as MpSnapshotRow[];
    const items = mpRevertItems(snapshot);
    if (!items.length) return NextResponse.json({ error: 'У знімку немає націнок для відкату' }, { status: 400 });

    const current = await loadMpMarkups(db, items.map(i => i.sku));
    const drifted = mpDriftedSkus(snapshot, current);

    const errs = await applyMpMarkups(db, items);
    if (errs.length) return NextResponse.json({ error: 'Відкат частково не вдався: ' + errs.slice(0, 5).join('; ') }, { status: 500 });

    const now = new Date().toISOString();
    await db.from('price_change_log').update({ status: 'reverted', reverted_at: now }).eq('id', entry.id);

    const when = new Date(entry.created_at as string).toLocaleDateString('uk-UA');
    const res = await insertLogEntry(db, user, {
      type: 'mp_revert', value: 0, target: entry.target as string, status: 'applied',
      count: items.length,
      comment: `Відкат переоцінки від ${when}` + (drifted.length ? ` · ${drifted.length} товарів змінювались після неї` : ''),
      // Знімок відкату — дзеркальний: «до» = стан після переоцінки, «після» = повернутий
      snapshot: snapshot.map(r => ({ sku: r.sku, name: r.name, before: r.after, after: r.before })),
    });
    if ('error' in res) return NextResponse.json({ ok: true, reverted: items.length, drifted, log_error: res.error });

    return NextResponse.json({ ok: true, reverted: items.length, drifted, reverted_at: now, revert_log_id: res.id });
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
