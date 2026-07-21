import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase';
import { alertAdmin } from '../../../../lib/alert';

// Сторож pg_cron-синку маркетплейсів. Живе на Vercel cron (managed — не зникне
// разом із БД), тому це незалежний зовнішній контроль. Раз на запуск:
//   1) звіряє pg_cron із app_settings і САМ відновлює, якщо задання зникли/
//      розійшлися (ensure_marketplace_sync робить репарацію в БД);
//   2) алертить у Telegram, якщо була репарація (дрейф) або задання «затихло»
//      (колись працювало, тепер не запускається — напр. протух токен/зупинка).
// Без цього сторожа зникнення pg_cron лишалось би непоміченим до наступного
// ранку (і без сигналу взагалі).

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc('ensure_marketplace_sync');
  if (error) {
    alertAdmin('Сторож маркетплейс-синку впав', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const health = (data ?? {}) as { repaired?: boolean; desired_min?: number; stale?: string[] };
  if (health.repaired) {
    alertAdmin(
      'Маркетплейс-синк: pg_cron дрейфнув — відновлено',
      `Задання пересоздано з інтервалом ${health.desired_min} хв.`,
    );
  } else if (Array.isArray(health.stale) && health.stale.length > 0) {
    alertAdmin(
      'Маркетплейс-синк: задання затихло',
      `Не запускалось: ${health.stale.join(', ')}. Перевір pg_cron / токен.`,
    );
  }

  return NextResponse.json({ ok: true, ...health });
}

// Vercel cron шле GET; лишаємо POST теж, на випадок виклику через pg_net.
export const POST = GET;
