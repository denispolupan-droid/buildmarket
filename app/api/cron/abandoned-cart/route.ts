import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildAbandonedCartEmail, getAbandonedCartSubject } from '../../../../lib/abandoned-cart-email';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'FIXLINE <noreply@fixline.com.ua>';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';

// Адреса має бути дописаною. Недописані рядки лишились у базі з часів, коли
// кошик зберігався за перевіркою includes('@'): Resend їх відбиває, timestamp
// не проставляється, і крон довбився в ті самі п'ять адрес кожні 30 хвилин.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Нагадування має сенс, поки покупець ще пам'ятає, що складав кошик. Лист «ви
// щось забули» через місяць — не продаж, а спам, за який платить репутація
// домену. Ланцюжок 1 год → 24 год → 72 год у це вікно вкладається з запасом.
const MAX_AGE_DAYS = 7;

type CartRow = {
  id: string;
  email: string;
  items: Array<{ name: string; brand: string; qty: number; price: number; volume?: string | null }>;
  total_price: number;
  recover_token: string;
  last_seen_at: string;
};

async function sendReminder(cart: CartRow, step: 1 | 2 | 3, field: string): Promise<boolean> {
  const restoreUrl = `${SITE_URL}/cart?restore=${cart.recover_token}`;
  const html = buildAbandonedCartEmail({
    items: cart.items,
    totalPrice: cart.total_price,
    restoreUrl,
    reminderStep: step,
  });

  const { error } = await resend.emails.send({
    from: FROM,
    to: cart.email,
    subject: getAbandonedCartSubject(step),
    html,
  });

  if (error) {
    console.error('[abandoned-cart] send failed:', cart.email, error);
    return false;
  }
  await admin
    .from('abandoned_carts')
    .update({ [field]: new Date().toISOString() })
    .eq('id', cart.id);
  return true;
}

/**
 * Одна людина — один лист. Поки кошик зберігався на кожну паузу в наборі, на
 * одну адресу заводилось по кілька рядків (`admin+sha@`, `admin+shataevO@`,
 * `admin+shataev@…`), і кожен слав власний ланцюжок із трьох листів.
 * Валідні адреси, найсвіжіший рядок на адресу.
 */
function pickOnePerEmail(rows: CartRow[] | null): CartRow[] {
  const newest = new Map<string, CartRow>();
  for (const row of rows ?? []) {
    const email = String(row.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    if (!Array.isArray(row.items) || row.items.length === 0) continue;
    const prev = newest.get(email);
    if (!prev || row.last_seen_at > prev.last_seen_at) newest.set(email, { ...row, email });
  }
  return [...newest.values()];
}

const COLS = 'id, email, items, total_price, recover_token, last_seen_at';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const h1 = new Date(now - 1 * 60 * 60 * 1000).toISOString();
  const h24 = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const h72 = new Date(now - 72 * 60 * 60 * 1000).toISOString();
  const oldest = new Date(now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [r1, r2, r3] = await Promise.all([
    admin.from('abandoned_carts')
      .select(COLS)
      .is('recovered_at', null).is('reminder_1_at', null)
      .lt('last_seen_at', h1).gte('last_seen_at', oldest),

    admin.from('abandoned_carts')
      .select(COLS)
      .is('recovered_at', null).is('reminder_2_at', null)
      .not('reminder_1_at', 'is', null)
      .lt('last_seen_at', h24).gte('last_seen_at', oldest),

    admin.from('abandoned_carts')
      .select(COLS)
      .is('recovered_at', null).is('reminder_3_at', null)
      .not('reminder_2_at', 'is', null)
      .lt('last_seen_at', h72).gte('last_seen_at', oldest),
  ]);

  const results = { r1: 0, r2: 0, r3: 0, failed: 0 };

  for (const [rows, step, field, key] of [
    [r1.data as CartRow[] | null, 1, 'reminder_1_at', 'r1'],
    [r2.data as CartRow[] | null, 2, 'reminder_2_at', 'r2'],
    [r3.data as CartRow[] | null, 3, 'reminder_3_at', 'r3'],
  ] as const) {
    for (const cart of pickOnePerEmail(rows)) {
      if (await sendReminder(cart, step, field)) results[key]++;
      else results.failed++;
    }
  }

  return NextResponse.json(results);
}
