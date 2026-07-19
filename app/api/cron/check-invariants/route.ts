import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { alertAdmin } from '../../../../lib/alert';

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

  if (failed.length) {
    alertAdmin(
      '🔴 Облік: порушено інваріанти БД',
      failed.map(f => `${f.invariant}: ${f.details ?? f.status}`).join('\n'),
    );
    return NextResponse.json({ ok: false, failed }, { status: 500 });
  }

  return NextResponse.json({ ok: true, checked: rows.length });
}

export const POST = GET;
