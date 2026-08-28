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

  return NextResponse.json({ sent, failed, skipped });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
