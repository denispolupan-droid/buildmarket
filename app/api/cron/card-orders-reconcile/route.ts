import { NextRequest, NextResponse } from 'next/server';
import { recoverPaidCardOrders } from '../../../../lib/card-order-recovery';
import { cronAuthorized } from '../../../../lib/cron-auth';
import { alertAdmin } from '../../../../lib/alert';
import { withCronLock } from '../../../../lib/cron-lock';
import { withApi } from '../../../../lib/api-handler';

// Страховка на карткові оплати: якщо вебхук Monobank не створив замовлення, це
// зробить звірка з випискою мерчанта. Основний шлях лишається вебхуком (замовлення
// зʼявляється за секунди), а крон ловить те, що крізь нього провалилось.
//
// Потрібен, бо мовчазна втрата тут коштує не «незручності», а грошей покупця:
// 04–07.08.2026 через зламану перевірку підпису не створилось жодного карткового
// замовлення, і дізналися ми про це зі скарги клієнта, а не з моніторингу.
async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await recoverPaidCardOrders({
      days:      7,        // рівно стільки живуть чернетки
      notify:    true,     // кожна знахідка = вебхук не спрацював, про це треба знати
      createdBy: 'cron:card-orders-reconcile',
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[card-orders-reconcile]', err);
    alertAdmin('Cron: звірка карткових оплат впала', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}

// Тік не стартує поверх ще живого попереднього (lib/cron-lock, міграція 141,
// аудит 31.10.2026). Зайнятий лок — це не збій: відповідаємо 200 без алерту.
export const maxDuration = 120;

async function _GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const locked = await withCronLock('card-orders-reconcile', 240, () => run(req));
  if (locked.skipped) return NextResponse.json({ ok: true, skipped: 'locked' });
  return locked.result;
}

export const GET = withApi('cron/card-orders-reconcile', _GET);
