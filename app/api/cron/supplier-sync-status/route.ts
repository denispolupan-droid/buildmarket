import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { alertAdmin } from '../../../../lib/alert';

// «Dead man's switch» для синку постачальників: перевіряє, що ціни/залишки нещодавно
// оновлювались. Синк ходить кожні 2 години (sync-suppliers.yml); якщо останній запуск
// старший за STALE_HOURS — крон, схоже, застряг (воркфлоу вимкнено/недоступний роут), і
// сайт показує застарілі ціни. Крутиться на проді зі своїм service-role — prod-ключі в CI
// не потрібні. Дьоргається з health-check за CRON_SECRET; при застряганні алерт у Telegram.

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const STALE_HOURS = 6;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await serviceClient
    .from('supplier_sync_log')
    .select('started_at')
    .eq('supplier_id', 1)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    alertAdmin('Синк постачальників: не вдалось перевірити свіжість', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.started_at) {
    alertAdmin('Синк постачальників: жодного запуску в логах');
    return NextResponse.json({ ok: false, reason: 'never synced' }, { status: 500 });
  }

  const ageHours = (Date.now() - new Date(data.started_at).getTime()) / 3_600_000;

  if (ageHours > STALE_HOURS) {
    alertAdmin(
      '🟠 Синк постачальників застряг',
      `Останній синк ${ageHours.toFixed(1)} год тому (поріг ${STALE_HOURS} год) — ціни/залишки можуть бути застарілі.`,
    );
    return NextResponse.json(
      { ok: false, lastSync: data.started_at, ageHours: Number(ageHours.toFixed(1)) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, lastSync: data.started_at, ageHours: Number(ageHours.toFixed(1)) });
}

export const POST = GET;
