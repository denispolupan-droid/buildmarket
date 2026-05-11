import { createClient } from '@supabase/supabase-js';
import PartnersClient from './PartnersClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function PartnersPage() {
  const [{ data: partners }, { data: payouts }] = await Promise.all([
    db.from('customers')
      .select('id, name, email, phone, balance, balance_held, is_active, created_at, partner_code, type')
      .in('type', ['dropship_partner', 'wholesale'])
      .order('created_at', { ascending: false }),

    db.from('partner_payout_requests')
      .select('id, customer_id, amount, method, status, bank_details, requested_at, notes')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true }),
  ]);

  // Статистика по кожному партнеру
  const partnerIds = (partners ?? []).map(p => p.id);
  const { data: orderStats } = partnerIds.length ? await db
    .from('orders')
    .select('partner_code, status')
    .in('partner_code', partnerIds)
    .eq('channel_code', 'dropship') : { data: [] };

  const statsMap = new Map<string, { total: number; delivered: number }>();
  for (const o of orderStats ?? []) {
    if (!statsMap.has(o.partner_code)) statsMap.set(o.partner_code, { total: 0, delivered: 0 });
    const s = statsMap.get(o.partner_code)!;
    s.total++;
    if (o.status === 'delivered') s.delivered++;
  }

  const partnersWithStats = (partners ?? []).map(p => ({
    ...p,
    orders_total:     statsMap.get(p.id)?.total     ?? 0,
    orders_delivered: statsMap.get(p.id)?.delivered ?? 0,
  }));

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <PartnersClient
        partners={partnersWithStats}
        pendingPayouts={payouts ?? []}
      />
    </div>
  );
}
