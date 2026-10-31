/**
 * Рядок журналу переоцінок (price_change_log) + документ «Переоцінка» в обліку
 * (acc_documents, doc_type=price_change). Один запис для всіх джерел: роут
 * /api/admin/prices/log (дія користувача) і крони (відкат за датою, відкладене
 * застосування) — щоб підписи й нумерація документів не розходились.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const PRICE_LOG_TYPE_LABEL: Record<string, string> = {
  multiply_cost: '× від собівартості',
  increase_pct:  '% зміна',
  fixed:         'Фіксована ціна',
  set_markup:    'Націнка = N %',
  mp_revert:     'Відкат переоцінки МП',
  manual:        'Ручна правка',
  promo_cancel:  'Завершення акції',
  supplier_discount: 'Знижка постачальника',
};

export const PRICE_LOG_TARGET_LABEL: Record<string, string> = {
  retail:  'Роздріб',
  unit:    'Опт',
  drop:    'Дроп',
  all:     'Всі',
  rozetka: 'Rozetka',
  prom:    'Prom',
  mp:      'Prom + Rozetka',
};

export type PriceLogInput = {
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

/** userId = null для кронів (user_id у таблиці nullable). Повертає id рядка або помилку. */
export async function insertPriceChangeLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  userId: string | null,
  input: PriceLogInput,
): Promise<{ id: number } | { error: string }> {
  const isPending = input.status === 'pending';

  const { data: logRow, error } = await db.from('price_change_log').insert({
    user_id:        userId,
    type:           input.type,
    value:          Number(input.value) || 0,
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
    console.error('[price-change-log] insert error:', error);
    return { error: error?.message ?? 'insert failed' };
  }

  const typeStr   = PRICE_LOG_TYPE_LABEL[input.type] ?? input.type;
  const targetStr = PRICE_LOG_TARGET_LABEL[input.target] ?? input.target;
  const pct = input.type === 'increase_pct' || input.type === 'set_markup' ? '%' : '';
  const notes = [
    input.type === 'mp_revert' ? `${typeStr} — ${targetStr}` : `${typeStr}: ${input.value}${pct} — ${targetStr}`,
    input.is_promo  ? '[Акція]'       : null,
    isPending       ? '[Заплановано]' : null,
    input.revert_at ? `до ${input.revert_at}` : null,
    input.comment   ?? null,
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
