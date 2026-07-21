import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import MarketplaceBalanceClient from './MarketplaceBalanceClient';
import { computePromCommission } from '../../../../lib/prom-commission';
import { computeRozetkaCommission } from '../../../../lib/rozetka-commission';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export type InTransitItem = { docId: string; orderNumber: number | null; ttn: string | null; commission: number };
export type InTransit = { total: number; items: InTransitItem[] };

// Комісії «в дорозі»: очікувана комісія по РН-чернетках (посилки відвантажені, ще не
// доставлені → комісія ще НЕ проведена). Для оперативної звірки з кабінетом площадки.
async function loadInTransitCommission(marketplace: 'prom' | 'rozetka'): Promise<InTransit> {
  const { data: docs } = await db
    .from('acc_documents')
    .select('id, order_id, tracking_number')
    .eq('doc_type', 'sale')
    .eq('status', 'draft')
    .not('order_id', 'is', null);
  if (!docs?.length) return { total: 0, items: [] };

  const orderIds = [...new Set(docs.map(d => d.order_id))];
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, channel_code')
    .in('id', orderIds)
    .eq('channel_code', marketplace);
  const orderMap = new Map((orders ?? []).map(o => [o.id, o]));
  const mpDocs = docs.filter(d => orderMap.has(d.order_id));
  if (!mpDocs.length) return { total: 0, items: [] };

  const settingKeys = marketplace === 'prom' ? ['prom_plan', 'prom_commission_pct'] : ['rozetka_commission_pct'];
  const { data: settings } = await db.from('app_settings').select('key, value').in('key', settingKeys);
  const sMap = new Map((settings ?? []).map(s => [s.key, s.value]));
  const plan = (sMap.get('prom_plan') ?? 'single') as 'single' | 'econom';
  const fallbackPct = parseFloat(sMap.get(marketplace === 'prom' ? 'prom_commission_pct' : 'rozetka_commission_pct') ?? (marketplace === 'prom' ? '3' : '15'));

  const items: InTransitItem[] = [];
  let total = 0;
  for (const d of mpDocs) {
    const { data: lines } = await db.from('acc_document_lines').select('sku, qty, price').eq('document_id', d.id);
    const li = (lines ?? []).map(l => ({ sku: l.sku, qty: Number(l.qty), price: Number(l.price) }));
    const commission = marketplace === 'prom'
      ? (await computePromCommission(li, { plan, fallbackPct })).total_commission
      : (await computeRozetkaCommission(li, { fallbackPct })).total_commission;
    const o = orderMap.get(d.order_id)!;
    total += commission;
    items.push({ docId: d.id, orderNumber: o.order_number, ttn: d.tracking_number, commission: Math.round(commission * 100) / 100 });
  }
  return { total: Math.round(total * 100) / 100, items };
}

export type LedgerRow = {
  id: string;
  business_date: string;
  account_type: string;
  amount: number;
  doc_type: string | null;
  order_id: string | null;
  description: string | null;
  created_by: string | null;
};

async function loadMarketplace(marketplace: 'prom' | 'rozetka') {
  const { data } = await db
    .from('money_entries')
    .select('id, business_date, account_type, amount, doc_type, order_id, description, created_by, created_at')
    .in('account_type', ['marketplace_balance', 'marketplace_fee'])
    .eq('counterparty_id', marketplace)
    .order('business_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (data ?? []) as LedgerRow[];
  const balance = rows
    .filter(r => r.account_type === 'marketplace_balance')
    .reduce((s, r) => s + Number(r.amount), 0);

  return { rows, balance: Math.round(balance * 100) / 100 };
}

export default async function MarketplaceBalancePage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const [prom, rozetka] = await Promise.all([
    Promise.all([loadMarketplace('prom'), loadInTransitCommission('prom')]).then(([m, t]) => ({ ...m, inTransit: t })),
    Promise.all([loadMarketplace('rozetka'), loadInTransitCommission('rozetka')]).then(([m, t]) => ({ ...m, inTransit: t })),
  ]);

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Баланс маркетплейсів
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Поповнення та автоматичне списання комісії за доставлені замовлення — звіряйте з реальним балансом у кабінеті Prom/Rozetka
          </p>
        </div>
      </div>

      <MarketplaceBalanceClient
        prom={prom}
        rozetka={rozetka}
      />
    </div>
  );
}
