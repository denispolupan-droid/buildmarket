import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Прохання про відгук після доставки (SEO: зірки AggregateRating у видачі).
// Одне-єдине письмо на замовлення, тільки реальним покупцям, через 5+ днів
// після доставки — товар уже випробуваний.

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'FIXLINE <noreply@fixline.com.ua>';
const BASE = 'https://fixline.com.ua';
const DAYS_AFTER_DELIVERY = 5;
const BATCH = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type OrderItem = { sku: string; name: string };

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - DAYS_AFTER_DELIVERY * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders, error } = await serviceClient
    .from('orders')
    .select('id, order_number, contact, email, items, review_token, delivered_at')
    .eq('status', 'delivered')
    .is('review_request_sent_at', null)
    .not('email', 'is', null)
    .neq('email', '')
    .not('review_token', 'is', null)
    .lte('delivered_at', cutoff)
    .order('delivered_at', { ascending: true })
    .limit(BATCH);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ sent: 0 });

  let sent = 0, failed = 0, skipped = 0;
  for (const order of orders) {
    const email = (order.email ?? '').trim();
    // Замовлення з маркетплейсів приходять без пошти — тихо пропускаємо,
    // інакше вони щодня забивають партію і живі адреси до неї не доходять.
    if (!EMAIL_RE.test(email)) { skipped++; continue; }
    const items = (order.items ?? []) as OrderItem[];
    const firstName = (order.contact ?? '').trim().split(/\s+/)[0] || '';
    const reviewUrl = `${BASE}/review/${order.review_token}`;

    const itemsHtml = items.slice(0, 5)
      .map(i => `<li style="margin-bottom:4px">${escapeHtml(i.name)}</li>`)
      .join('');

    try {
      const { error: sendErr } = await resend.emails.send({
        from: FROM,
        to: email,
        subject: `Як вам покупка? Оцініть товари із замовлення №${order.order_number}`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1E293B">
  <h2 style="font-size:20px">${firstName ? `${escapeHtml(firstName)}, д` : 'Д'}якуємо за покупку у FIXLINE!</h2>
  <p>Ваше замовлення №${order.order_number} доставлено. Будемо вдячні за короткий відгук — це займе хвилину й допоможе іншим покупцям обрати товар.</p>
  <ul style="padding-left:20px">${itemsHtml}</ul>
  <p style="margin:24px 0">
    <a href="${reviewUrl}" style="background:#1E3A5F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">
      Залишити відгук
    </a>
  </p>
  <p style="color:#64748B;font-size:13px">Оценить покупку можно на украинском или русском — как вам удобнее.</p>
  <p style="color:#94A3B8;font-size:12px;margin-top:32px">
    Це єдиний лист із проханням про відгук — ми не надсилаємо розсилок.
    Якщо лист потрапив до вас помилково, просто проігноруйте його.
  </p>
</div>`,
      });
      if (sendErr) throw sendErr;

      await serviceClient
        .from('orders')
        .update({ review_request_sent_at: new Date().toISOString() })
        .eq('id', order.id);
      sent++;
    } catch (err) {
      console.error(`review-request failed for order ${order.id}:`, err);
      failed++;
    }
  }

  const reminders = await sendReminders();
  return NextResponse.json({ sent, failed, skipped, reminders });
}

const REMINDER_AFTER_DAYS = 9;

/**
 * Друге (і останнє) нагадування: перший лист дав ~4,5 % відгуків (44 → 2 за
 * 90 днів). Через 9 днів тим, хто не залишив відгук, — короткий лист із тим
 * самим посиланням. Більше не пишемо: обіцянка «єдиний лист» у першому листі
 * стосувалась розсилок, а не одного нагадування, і після нього — тиша.
 */
async function sendReminders(): Promise<{ sent: number; failed: number }> {
  const cutoff = new Date(Date.now() - REMINDER_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders } = await serviceClient
    .from('orders')
    .select('id, order_number, contact, email, review_token')
    .eq('status', 'delivered')
    .is('review_reminder_sent_at', null)
    .not('review_request_sent_at', 'is', null)
    .lte('review_request_sent_at', cutoff)
    .not('review_token', 'is', null)
    .order('review_request_sent_at', { ascending: true })
    .limit(BATCH);
  if (!orders?.length) return { sent: 0, failed: 0 };

  // Хто вже відгукнувся — нагадувати нема про що
  const { data: reviewed } = await serviceClient
    .from('product_reviews').select('order_id').in('order_id', orders.map(o => o.id));
  const done = new Set((reviewed ?? []).map(r => r.order_id as string));

  let sent = 0, failed = 0;
  for (const order of orders) {
    const email = (order.email ?? '').trim();
    if (done.has(order.id) || !EMAIL_RE.test(email)) {
      // відгук є або пошти немає — закриваємо, щоб не перебирати щодня
      await serviceClient.from('orders').update({ review_reminder_sent_at: new Date().toISOString() }).eq('id', order.id);
      continue;
    }
    const firstName = (order.contact ?? '').trim().split(/\s+/)[0] || '';
    const reviewUrl = `${BASE}/review/${order.review_token}`;
    try {
      const { error: sendErr } = await resend.emails.send({
        from: FROM,
        to: email,
        subject: `Хвилинка на відгук? Замовлення №${order.order_number}`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1E293B">
  <p>${firstName ? `${escapeHtml(firstName)}, в` : 'В'}и вже встигли випробувати товари із замовлення №${order.order_number}?</p>
  <p>Коротка оцінка зірочками займає хвилину, а іншим покупцям допомагає обрати правильно. Це останнє нагадування — далі ми не турбуємо.</p>
  <p style="margin:24px 0">
    <a href="${reviewUrl}" style="background:#1E3A5F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Оцінити товари</a>
  </p>
  <p style="color:#94A3B8;font-size:12px;margin-top:32px">Якщо лист потрапив до вас помилково, просто проігноруйте його.</p>
</div>`,
      });
      if (sendErr) throw sendErr;
      await serviceClient.from('orders').update({ review_reminder_sent_at: new Date().toISOString() }).eq('id', order.id);
      sent++;
    } catch (err) {
      console.error(`review-reminder failed for order ${order.id}:`, err);
      failed++;
    }
  }
  return { sent, failed };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
