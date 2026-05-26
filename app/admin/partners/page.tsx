import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import PartnersClient from './PartnersClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function PartnersPage() {
  const [{ data: customers }, { data: payouts }] = await Promise.all([
    db.from('customers')
      .select('id, name, email, phone, company, city, type, price_tier, balance, balance_held, is_active, orders_count, total_revenue, last_order_at, created_at, partner_code, credit_limit, notes')
      .order('last_order_at', { ascending: false, nullsFirst: false }),

    db.from('partner_payout_requests')
      .select('id, customer_id, amount, method, status, bank_details, requested_at, notes')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true }),
  ]);

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1400px' }}>
      <Suspense>
        <PartnersClient
          customers={customers ?? []}
          pendingPayouts={payouts ?? []}
        />
      </Suspense>
    </div>
  );
}
