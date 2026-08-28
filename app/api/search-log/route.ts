import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createServiceClient } from '../../../lib/supabase';
import { rateLimit, getClientIp } from '../../../lib/rate-limit';

// Журнал пошуку по сайту: що люди шукали і скільки знайшли.
//
// Писався клієнтом під RLS, а політика search_queries («internal_only», USING
// false) забороняє запис усім ролям — тож кожна вставка мовчки відхилялась, і
// за весь час таблиця лишилась порожньою. Помилку роут не перевіряв, тому це
// ніде не спливло. Пишемо сервісним ключем; читати таблицю сторонні як не
// могли, так і не можуть — політика лишається закритою.
export async function POST(req: NextRequest) {
  // Rate limit: 60 search logs per IP per minute
  const ip = getClientIp(req);
  if (!rateLimit(`search-log:${ip}`, 60, 60 * 1000)) {
    return NextResponse.json({ ok: false });
  }

  const { query, resultsCount } = await req.json().catch(() => ({ query: null, resultsCount: null }));

  if (typeof query !== 'string' || query.trim().length < 2) {
    return NextResponse.json({ ok: false });
  }
  // Межа довжини: у поле пошуку прилітає і випадково вставлений абзац.
  const text = query.trim().toLowerCase().slice(0, 200);

  // Хто шукав — беремо з сесії користувача; запис робить сервісний клієнт.
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await createServiceClient().from('search_queries').insert({
    query: text,
    results_count: Number.isFinite(resultsCount) ? Number(resultsCount) : null,
    user_id: user?.id ?? null,
  });
  if (error) {
    // Журнал не вартий помилки на очах у покупця, але й мовчати не варто —
    // саме мовчання й приховало поломку на місяці.
    console.error('[search-log] insert failed:', error.message);
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json({ ok: true });
}
