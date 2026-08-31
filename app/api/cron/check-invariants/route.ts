import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { alertAdmin } from '../../../../lib/alert';
import { findSaleDivergences, type SaleDivergence } from '../../../../lib/accounting/reconcile-sale-docs';

// Перевірка інваріантів обліку на БОЙОВІЙ базі (той самий check_invariants, що ганяється
// в тестах). Виконується на проді, де вже є service-role креденшели — не потрібно класти
// prod-ключі в GitHub. Дьоргається щоденно з GitHub Actions за CRON_SECRET.
// Якщо якийсь інваріант порушено (розійшлись баланси/залишки) — алерт у Telegram.

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await serviceClient.rpc('check_invariants');
  if (error) {
    alertAdmin('Облік: не вдалось перевірити інваріанти БД', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { invariant: string; status: string; details?: string }[];
  const failed = rows.filter(r => r.status !== 'OK');

  // Друга перевірка — не про БД, а про людей: ручна правка позицій після того,
  // як видаткова вже проведена, лишає документ і замовлення з різними сумами.
  // Інваріанти БД такого не ловлять (обидві сторони самі по собі коректні),
  // тож звіряємо окремо. Помилка звірки не має гасити основну перевірку.
  let divergences: SaleDivergence[] = [];
  try {
    divergences = await findSaleDivergences();
  } catch (err) {
    console.error('[invariants] звірка замовлень із накладними не пройшла', err);
  }

  if (divergences.length) {
    alertAdmin(
      `🟠 Облік: замовлення розійшлись із проведеними накладними (${divergences.length})`,
      divergences.slice(0, 15).map(d =>
        `№${d.orderNumber ?? '—'} (${d.docNumbers.join(', ')}): замовлення ${d.orderAmount} ≠ накладна ${d.docAmount}, різниця ${d.diff > 0 ? '+' : ''}${d.diff}`,
      ).join('\n'),
    );
  }

  if (failed.length) {
    alertAdmin(
      '🔴 Облік: порушено інваріанти БД',
      failed.map(f => `${f.invariant}: ${f.details ?? f.status}`).join('\n'),
    );
    return NextResponse.json({ ok: false, failed, divergences }, { status: 500 });
  }

  return NextResponse.json({ ok: true, checked: rows.length, divergences });
}

export const POST = GET;
