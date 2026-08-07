import { NextRequest, NextResponse } from 'next/server';
import { recoverPaidCardOrders } from '../../../../lib/card-order-recovery';

// Страховка на карткові оплати: якщо вебхук Monobank не створив замовлення, це
// зробить звірка з випискою мерчанта. Основний шлях лишається вебхуком (замовлення
// зʼявляється за секунди), а крон ловить те, що крізь нього провалилось.
//
// Потрібен, бо мовчазна втрата тут коштує не «незручності», а грошей покупця:
// 04–07.08.2026 через зламану перевірку підпису не створилось жодного карткового
// замовлення, і дізналися ми про це зі скарги клієнта, а не з моніторингу.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
