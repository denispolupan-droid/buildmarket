import { NextRequest, NextResponse } from 'next/server';
import { importMailRegisters } from '../../../../lib/mail-registers';
import { alertAdmin } from '../../../../lib/alert';

// Реєстри виплат з пошти (НоваПей по ЕН, RozetkaPay по замовленнях) → облік.
// Листи приходять уранці наступного дня; крон бере останні 3 дні — необроблені
// (no-doc: виписка ще не підтягнута) добираються повторно.

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const res = await importMailRegisters({ days: 3, createdBy: 'cron:mail-registers' });
    const unknown = res.processed.filter(p => /без замовлення/.test(p.summary));
    if (res.errors.length || unknown.length) {
      alertAdmin('Реєстри з пошти: є що подивитись',
        [...res.errors.map(e => `⚠ ${e}`), ...unknown.map(u => `${u.kind} ${u.registerNo ?? ''}: ${u.summary}`)].join('\n').slice(0, 1500));
    }
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alertAdmin('Cron: імпорт реєстрів з пошти впав', msg.slice(0, 300));
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}

export const POST = GET;
