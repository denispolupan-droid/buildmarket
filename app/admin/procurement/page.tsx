import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import ProcurementClient from './ProcurementClient';
import ProcurementList from './ProcurementList';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);


function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

export default async function ProcurementPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const [{ data: pos }, { data: suppliers }, { data: receipts }] = await Promise.all([
    db.from('open_purchase_orders').select('*').limit(200),
    db.from('suppliers').select('id, name, email').eq('is_active', true).order('name'),
    db.from('acc_documents')
      .select('id, doc_number, doc_date, status, total_cost, parent_doc_id, notes')
      .in('doc_type', ['receipt', 'stock_in'])
      .eq('status', 'confirmed')
      .not('parent_doc_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const receiptMap = new Map<string, typeof receipts>(); // parent_doc_id → receipts
  for (const r of (receipts ?? [])) {
    if (!r.parent_doc_id) continue;
    if (!receiptMap.has(r.parent_doc_id)) receiptMap.set(r.parent_doc_id, []);
    receiptMap.get(r.parent_doc_id)!.push(r);
  }

  const orders = pos ?? [];
  const totalDrafts   = orders.filter(p => p.procurement_status === 'draft').length;
  const totalPending  = orders.filter(p => !p.has_receipt && p.procurement_status !== 'draft').length;
  const totalReceived = orders.filter(p => p.has_receipt && p.procurement_status !== 'paid').length;
  const totalAmount = orders.reduce((s, p) => s + Number(p.total_cost ?? 0), 0);

  // Деталі для карток
  const draftOrders    = orders.filter(p => p.procurement_status === 'draft');
  const pendingOrders  = orders.filter(p => !p.has_receipt && p.procurement_status !== 'draft');
  const receivedOrders = orders.filter(p => p.has_receipt && p.procurement_status !== 'paid');

  const amountDrafts   = draftOrders.reduce((s, p) => s + Number(p.total_cost ?? 0), 0);
  const amountPending  = pendingOrders.reduce((s, p) => s + Number(p.total_cost ?? 0), 0);
  const amountReceived = receivedOrders.reduce((s, p) => s + Number(p.total_cost ?? 0), 0);

  function fmtDate(d: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Закупівля</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Відкриті замовлення постачальникам — від відправки до оплати
          </p>
        </div>
        <ProcurementClient suppliers={suppliers ?? []} />
      </div>

      {/* Stats — 4 однакові картки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>

        {/* Чернетки */}
        <StatCard href="/admin/procurement?filter=draft" accent="#94A3B8">
          <StatLeft count={totalDrafts} label="Чернетки" color="#64748B" />
          <StatItems items={draftOrders.slice(-4).reverse().map(p => ({
            name: p.supplier_name ?? '—',
            sub:  fmtDate(p.doc_date),
            amt:  p.total_cost ? fmt(Number(p.total_cost)) + ' ₴' : null,
          }))} />
        </StatCard>

        {/* Очікуємо товар */}
        <StatCard href="/admin/procurement?filter=pending" accent="#4880B8">
          <StatLeft count={totalPending} label="Очікуємо товар" color="#1E3A5F" />
          <StatItems items={pendingOrders.slice(-4).reverse().map(p => ({
            name: p.supplier_name ?? '—',
            sub:  fmtDate(p.expected_date ?? p.doc_date),
            amt:  p.total_cost ? fmt(Number(p.total_cost)) + ' ₴' : null,
          }))} />
        </StatCard>

        {/* Отримано, не оплачено */}
        <StatCard href="/admin/procurement?filter=received" accent="#D97706">
          <StatLeft count={totalReceived} label="Отримано, не оплачено" color="#D97706" />
          <StatItems items={receivedOrders.slice(-4).reverse().map(p => ({
            name: p.supplier_name ?? '—',
            sub:  fmtDate(p.doc_date),
            amt:  p.total_cost ? fmt(Number(p.total_cost)) + ' ₴' : null,
          }))} />
        </StatCard>

        {/* Загальна сума */}
        <StatCard accent="#7C3AED">
          <StatLeft label="Загальна сума" color="#7C3AED" amount={`${fmt(totalAmount)} ₴`} />
          <StatItems items={[
            amountDrafts   > 0 ? { name: 'Чернетки',  sub: `${totalDrafts} замовл.`,   amt: fmt(amountDrafts)   + ' ₴' } : null,
            amountPending  > 0 ? { name: 'Очікуємо',  sub: `${totalPending} замовл.`,  amt: fmt(amountPending)  + ' ₴' } : null,
            amountReceived > 0 ? { name: 'Отримано',  sub: `${totalReceived} замовл.`, amt: fmt(amountReceived) + ' ₴' } : null,
          ].filter(Boolean) as { name: string; sub: string; amt: string | null }[]} />
        </StatCard>
      </div>

      {/* Table */}
      <ProcurementList orders={orders.map(po => ({ ...po, receipts: receiptMap.get(po.id) ?? [] }))} />
    </div>
  );
}

// ── Допоміжні компоненти карток ───────────────────────────────────────────────

function StatCard({ children, href, accent }: {
  children: React.ReactNode;
  href?: string;
  accent: string;
}) {
  const inner = (
    <div style={{
      padding: '14px 16px', borderRadius: '10px',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${accent}`,
      display: 'flex', gap: '12px', minHeight: '100px',
      height: '100%', boxSizing: 'border-box',
    }}>
      {children}
    </div>
  );
  return href
    ? <a href={href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</a>
    : <div>{inner}</div>;
}

function StatLeft({ count, label, color, amount }: {
  count?: number; label: string; color: string; amount?: string;
}) {
  return (
    <div style={{ flexShrink: 0, minWidth: '50px' }}>
      {amount
        ? <div style={{ fontSize: '20px', fontWeight: 800, color, lineHeight: 1.1 }}>{amount}</div>
        : <div style={{ fontSize: '26px', fontWeight: 800, color, lineHeight: 1 }}>{count}</div>
      }
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

function StatItems({ items }: { items: { name: string; sub: string; amt: string | null }[] }) {
  if (!items.length) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
    </div>
  );
  return (
    <div style={{
      flex: 1, borderLeft: '1px solid var(--border)', paddingLeft: '12px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '5px',
      overflow: 'hidden',
    }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '4px', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name}
            </div>
            {item.sub && (
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.sub}</div>
            )}
          </div>
          {item.amt && (
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>{item.amt}</div>
          )}
        </div>
      ))}
    </div>
  );
}
