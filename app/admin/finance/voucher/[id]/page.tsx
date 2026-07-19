import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Banknote } from 'lucide-react';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Сторінка платіжного ваучера (supplier_payment / customer_payment / cash_in / cash_out):
// раніше номер ваучера в payables був посиланням-заглушкою.

const TYPE_LABELS: Record<string, string> = {
  supplier_payment:          'Оплата постачальнику',
  supplier_payment_reversal: 'Сторно оплати постачальнику',
  customer_payment:          'Оплата від клієнта',
  customer_payment_reversal: 'Сторно оплати клієнта',
  cash_in:                   'Прибутковий касовий ордер (ПКО)',
  cash_out:                  'Видатковий касовий ордер (РКО)',
};

const ACCOUNT_LABELS: Record<string, string> = {
  supplier: 'Постачальник', customer: 'Покупець', bank: 'Банк', cash: 'Каса',
  acquiring: 'Еквайринг', correction: 'Коригування', advance: 'Аванси',
};

function fmt(n: number) {
  return Math.abs(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function VoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { id } = await params;
  const { data: doc } = await db
    .from('acc_documents')
    .select('id, doc_type, doc_number, status, total_amount, doc_date, supplier_id, customer_id, created_by, notes, meta')
    .eq('id', id)
    .in('doc_type', Object.keys(TYPE_LABELS))
    .maybeSingle();
  if (!doc) notFound();

  const [{ data: supplier }, { data: customer }, { data: entries }] = await Promise.all([
    doc.supplier_id ? db.from('suppliers').select('name').eq('id', doc.supplier_id).single() : Promise.resolve({ data: null }),
    doc.customer_id ? db.from('customers').select('name, company').eq('id', doc.customer_id).single() : Promise.resolve({ data: null }),
    db.from('money_entries')
      .select('account_type, counterparty_id, amount, business_date, description, created_by')
      .eq('doc_id', id)
      .order('created_at', { ascending: true }),
  ]);

  const counterpartyName = supplier?.name
    ?? (customer ? (customer.company || customer.name) : null)
    ?? '—';

  const meta = (doc.meta ?? {}) as Record<string, unknown>;

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '720px' }}>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Link href="/admin/finance/payables" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <Banknote size={18} color="#15803D" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          {TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
        </h1>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #1E3A5F', paddingBottom: '12px', marginBottom: '16px' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {doc.doc_number}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {doc.doc_date ? new Date(doc.doc_date).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
          </div>
        </div>

        <table style={{ width: '100%', fontSize: '13.5px', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              ['Контрагент', counterpartyName],
              ['Сума', `${fmt(Number(doc.total_amount))} ₴`],
              ['Спосіб', meta.payment_mode === 'cash' ? 'Готівка' : meta.payment_mode === 'transfer' ? 'Безготівковий' : String(meta.payment_mode ?? '—')],
              ['Статус', doc.status === 'confirmed' ? 'Проведено' : doc.status],
              ['Створив', doc.created_by ?? '—'],
              ...(doc.notes ? [['Примітка', doc.notes]] : []),
            ].map(([k, v]) => (
              <tr key={k as string}>
                <td style={{ padding: '6px 0', width: '160px', fontWeight: 700, color: 'var(--text-secondary)', verticalAlign: 'top' }}>{k}</td>
                <td style={{ padding: '6px 0', color: 'var(--text-primary)' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Проводки */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Проводки
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            {(entries ?? []).map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px', gap: '10px', padding: '8px 14px', borderTop: i > 0 ? '1px solid var(--border-light)' : 'none', fontSize: '12.5px', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: Number(e.amount) >= 0 ? '#1E3A5F' : '#B45309' }}>
                  {Number(e.amount) >= 0 ? 'Дт' : 'Кт'} · {ACCOUNT_LABELS[e.account_type] ?? e.account_type}
                </span>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description ?? ''}</span>
                <span style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(Number(e.amount))} ₴</span>
              </div>
            ))}
            {!entries?.length && <div style={{ padding: '14px', fontSize: '13px', color: 'var(--text-muted)' }}>Проводок немає</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
