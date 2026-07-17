import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import ReviewForm from './ReviewForm';

// Сторінка "оцініть покупку" за токеном з листа. Відгук = підтверджена покупка.

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Оцініть покупку | FIXLINE',
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID_RE.test(token)) notFound();

  const { data: order } = await serviceClient
    .from('orders')
    .select('id, order_number, contact, items')
    .eq('review_token', token)
    .single();

  if (!order) notFound();

  const items = ((order.items ?? []) as { sku: string; name: string }[]).slice(0, 10);

  // Які товари з замовлення вже мають відгук за цим замовленням
  const { data: existing } = await serviceClient
    .from('product_reviews')
    .select('product_sku')
    .eq('order_id', order.id);
  const reviewed = new Set((existing ?? []).map(r => r.product_sku));

  const firstName = (order.contact ?? '').trim().split(/\s+/)[0] || '';

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh', padding: '32px 16px 64px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
          {firstName ? `${firstName}, оцініть` : 'Оцініть'} вашу покупку
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
          Замовлення №{order.order_number}. Відгук допоможе іншим покупцям — дякуємо за хвилину вашого часу!
        </p>
        <ReviewForm
          token={token}
          authorDefault={firstName}
          items={items.map(i => ({ ...i, alreadyReviewed: reviewed.has(i.sku) }))}
        />
      </div>
    </div>
  );
}
