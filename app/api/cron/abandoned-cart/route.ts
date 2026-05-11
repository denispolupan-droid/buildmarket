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

type CartRow = {
  id: string;
  email: string;
  items: Array<{ name: string; brand: string; qty: number; price: number; volume?: string | null }>;
  total_price: number;
  recover_token: string;
};

async function sendReminder(cart: CartRow, step: 1 | 2 | 3, field: string) {
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

  if (!error) {
    await admin
      .from('abandoned_carts')
      .update({ [field]: new Date().toISOString() })
      .eq('id', cart.id);
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const h1 = new Date(now - 1 * 60 * 60 * 1000).toISOString();
  const h24 = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const h72 = new Date(now - 72 * 60 * 60 * 1000).toISOString();

  const [r1, r2, r3] = await Promise.all([
    admin.from('abandoned_carts')
      .select('id, email, items, total_price, recover_token')
      .is('recovered_at', null).is('reminder_1_at', null)
      .lt('last_seen_at', h1),

    admin.from('abandoned_carts')
      .select('id, email, items, total_price, recover_token')
      .is('recovered_at', null).is('reminder_2_at', null)
      .not('reminder_1_at', 'is', null)
      .lt('last_seen_at', h24),

    admin.from('abandoned_carts')
      .select('id, email, items, total_price, recover_token')
      .is('recovered_at', null).is('reminder_3_at', null)
      .not('reminder_2_at', 'is', null)
      .lt('last_seen_at', h72),
  ]);

  const results = { r1: 0, r2: 0, r3: 0 };

  for (const cart of (r1.data ?? []) as CartRow[]) {
    await sendReminder(cart, 1, 'reminder_1_at');
    results.r1++;
  }
  for (const cart of (r2.data ?? []) as CartRow[]) {
    await sendReminder(cart, 2, 'reminder_2_at');
    results.r2++;
  }
  for (const cart of (r3.data ?? []) as CartRow[]) {
    await sendReminder(cart, 3, 'reminder_3_at');
    results.r3++;
  }

  return NextResponse.json(results);
}
