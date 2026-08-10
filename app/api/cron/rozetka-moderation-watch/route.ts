import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { alertAdmin } from '../../../../lib/alert';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { getRozetkaContentChanges, getRozetkaGoods, buildContentSummary } from '../../../../lib/rozetka-content';
import { diffModeration, buildWatchAlert, type StoredState } from '../../../../lib/rozetka-moderation-watch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';

/**
 * Сторож модерації Rozetka. Раз на добу читає кабінет і пише в Telegram, якщо
 * з'явилися нові відмови: сам кабінет про долю заявок не повідомляє, а розділ
 * /admin/rozetka/moderation пасивний — треба зайти й подивитись. Без сторожа
 * сотня відхилених правок місяцями лишалась би непоміченою (саме так і сталося
 * з відмовою від 17.07, яку ми знайшли випадково).
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [changes, goods] = await Promise.all([getRozetkaContentChanges(), getRozetkaGoods()]);
    const summary = buildContentSummary(changes, goods, new Date().toISOString());

    const stored = await fetchAllRows<StoredState>((from, to) => db
      .from('rozetka_moderation_state')
      .select('sku, change_status, reasons')
      .range(from, to));

    const diff = diffModeration(summary, stored);

    // Перший запуск: порівнювати нема з чим, тому лише запам'ятовуємо стан.
    // Інакше сторож почав би знайомство з алертом на всі наявні проблеми.
    const firstRun = stored.length === 0;

    if (diff.next.length) {
      const { error } = await db.from('rozetka_moderation_state').upsert(
        diff.next.map(s => ({ ...s, checked_at: new Date().toISOString() })),
        { onConflict: 'sku' },
      );
      if (error) throw error;
    }
    // Позиції, з яких претензії зняли, прибираємо — інакше вони назавжди
    // лишились би в «бачили востаннє» і повторна відмова здалася б старою.
    if (diff.approved.length) {
      await db.from('rozetka_moderation_state').delete().in('sku', diff.approved);
    }

    const text = firstRun ? '' : buildWatchAlert(diff, SITE_URL);
    if (text) alertAdmin('Rozetka: модерація контенту', text);

    return NextResponse.json({
      ok: true,
      firstRun,
      pending: summary.pending,
      rejected: summary.rejected,
      newlyRejected: diff.newlyRejected.length,
      approved: diff.approved.length,
      alerted: Boolean(text),
    });
  } catch (e) {
    alertAdmin('Сторож модерації Rozetka впав', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
