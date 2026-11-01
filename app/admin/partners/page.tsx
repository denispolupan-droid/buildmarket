import { Suspense } from 'react';
import PartnersClient from './PartnersClient';
import { requireStaffPage } from '../../../lib/auth-guard';
import { createServiceClient } from '../../../lib/supabase-service';
import type { ComponentProps } from 'react';

const db = createServiceClient();

export default async function PartnersPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  const [{ data: customers }, { data: payouts }] = await Promise.all([
    db.from('customers')
      .select('id, name, email, phone, company, city, type, price_tier, balance, balance_held, is_active, orders_count, total_revenue, last_order_at, created_at, partner_code, credit_limit, notes, customer_number, legal_name, tax_number, address, legal_address, bank_name, bank_iban, bank_mfo, signatory_name, signatory_position')
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
          customers={(customers ?? []) as ComponentProps<typeof PartnersClient>['customers']}
          pendingPayouts={payouts ?? []}
        />
      </Suspense>
    </div>
  );
}
