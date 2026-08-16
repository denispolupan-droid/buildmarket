export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import ProcurementClient from './ProcurementClient';
import ProcurementWrapper from './ProcurementWrapper';
import SectionBar, { plural } from './SectionBar';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);


function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const initialFilter = params.filter ?? 'all';
  // Гейт — у layout розділу (requireStaffPage)

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
  const activeOrders  = orders.filter(p => p.procurement_status !== 'closed');
  const totalDrafts   = activeOrders.filter(p => p.procurement_status === 'draft').length;
  const totalPending  = activeOrders.filter(p => !p.has_receipt && p.procurement_status !== 'draft').length;
  const totalReceived = activeOrders.filter(p => p.has_receipt && p.procurement_status !== 'paid' && !p.meta?.is_paid).length;
  const totalAmount   = activeOrders.reduce((s, p) => s + Number(p.total_cost ?? 0), 0);

  // Деталі для карток
  const draftOrders    = activeOrders.filter(p => p.procurement_status === 'draft');
  const pendingOrders  = activeOrders.filter(p => !p.has_receipt && p.procurement_status !== 'draft');
  const receivedOrders = activeOrders.filter(p => p.has_receipt && p.procurement_status !== 'paid' && !p.meta?.is_paid);

  const amountDrafts   = draftOrders.reduce((s, p) => s + Number(p.total_cost ?? 0), 0);
  const amountPending  = pendingOrders.reduce((s, p) => s + Number(p.total_cost ?? 0), 0);
  const amountReceived = receivedOrders.reduce((s, p) => s + Number(p.total_cost ?? 0), 0);

  function fmtDate(d: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
  }

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Заголовок і вкладки — в layout розділу; тут лише дія цього екрана */}
      <SectionBar count={`${activeOrders.length} ${plural(activeOrders.length, 'активне замовлення', 'активні замовлення', 'активних замовлень')}`}>
        <ProcurementClient suppliers={suppliers ?? []} />
      </SectionBar>

      {/* Показники — той самий словник, що у «Фінансах» (.fin-card/.fin-kpi) */}
      <div className="fin-kpi-row cols-4" style={{ marginBottom: '16px' }}>
        <StatCard
          href="/admin/procurement?filter=draft"
          dot="muted"
          label="Чернетки"
          value={totalDrafts}
          foot={amountDrafts > 0 ? `${fmt(amountDrafts)} ₴` : null}
          rows={draftOrders.slice(-4).reverse().map(p => ({
            name: p.supplier_name ?? '—',
            sub:  fmtDate(p.doc_date),
            amt:  p.total_cost ? fmt(Number(p.total_cost)) + ' ₴' : null,
          }))}
        />

        <StatCard
          href="/admin/procurement?filter=pending"
          dot="blue"
          label="Очікуємо товар"
          value={totalPending}
          foot={amountPending > 0 ? `${fmt(amountPending)} ₴` : null}
          rows={pendingOrders.slice(-4).reverse().map(p => ({
            name: p.supplier_name ?? '—',
            sub:  fmtDate(p.expected_date ?? p.doc_date),
            amt:  p.total_cost ? fmt(Number(p.total_cost)) + ' ₴' : null,
          }))}
        />

        <StatCard
          href="/admin/procurement?filter=received"
          dot="orange"
          label="Отримано, не оплачено"
          value={totalReceived}
          foot={amountReceived > 0 ? `${fmt(amountReceived)} ₴` : null}
          rows={receivedOrders.slice(-4).reverse().map(p => ({
            name: p.supplier_name ?? '—',
            sub:  fmtDate(p.doc_date),
            amt:  p.total_cost ? fmt(Number(p.total_cost)) + ' ₴' : null,
          }))}
        />

        <StatCard
          label="Загальна сума"
          value={`${fmt(totalAmount)} ₴`}
          foot={`${activeOrders.length} ${plural(activeOrders.length, 'замовлення', 'замовлення', 'замовлень')} в роботі`}
          rows={[
            amountDrafts   > 0 ? { name: 'Чернетки',    sub: `${totalDrafts} замовл.`,   amt: fmt(amountDrafts)   + ' ₴' } : null,
            amountPending  > 0 ? { name: 'Очікуємо',    sub: `${totalPending} замовл.`,  amt: fmt(amountPending)  + ' ₴' } : null,
            amountReceived > 0 ? { name: 'Не оплачено', sub: `${totalReceived} замовл.`, amt: fmt(amountReceived) + ' ₴' } : null,
          ].filter(Boolean) as StatRow[]}
        />
      </div>

      {/* Table */}
      <ProcurementWrapper
        orders={orders.map(po => ({ ...po, receipts: receiptMap.get(po.id) ?? [] }))}
        initialFilter={initialFilter}
      />
    </div>
  );
}

// ── Картка-показник ───────────────────────────────────────────────────────────
// Розкладка як у «Фінансах»: підпис капсом → велика цифра → підвал → деталі.
// Стан позначає крапка біля підпису, а не кольорова рамка й кольорова цифра:
// чотири різнокольорові картки в ряд читались як чотири різні за важливістю,
// хоча це просто стадії одного процесу.

type StatRow = { name: string; sub: string; amt: string | null };

function StatCard({ href, dot, label, value, foot, rows }: {
  href?:  string;
  dot?:   'muted' | 'blue' | 'orange';
  label:  string;
  value:  React.ReactNode;
  foot?:  string | null;
  rows:   StatRow[];
}) {
  const dotColor = dot === 'orange' ? '#EA8A00' : dot === 'blue' ? 'var(--brand-blue)' : '#94A3B8';

  const body = (
    <>
      <div className="fin-kpi-label">
        {dot && <span className="fin-dot" style={{ background: dotColor }} />}
        {label}
      </div>
      <div className="fin-kpi-value">{value}</div>
      {foot && <div className="fin-kpi-foot"><span className="fin-kpi-cmp">{foot}</span></div>}
      {rows.length > 0 && (
        <table className="fin-table">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="name">
                  {r.name}
                  {r.sub && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {r.sub}</span>}
                </td>
                {r.amt && <td className="num">{r.amt}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );

  return href
    ? <a href={href} className="fin-card fin-kpi">{body}</a>
    : <div className="fin-card fin-kpi">{body}</div>;
}
