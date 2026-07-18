import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const EXPENSE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  logistics:       { label: 'Доставка',              color: '#1E3A5F', bg: '#EFF4FF' },
  loading:         { label: 'Навантаження',           color: '#0E7490', bg: '#ECFEFF' },
  customs:         { label: 'Мито / брокер',          color: '#7C3AED', bg: '#F5F3FF' },
  packaging:       { label: 'Пакування',              color: '#B45309', bg: '#FEF3C7' },
  acquiring_fee:   { label: 'Комісія еквайрингу',    color: '#EA580C', bg: '#FFF7ED' },
  marketplace_fee: { label: 'Комісія маркетплейсу',  color: '#DC2626', bg: '#FEF2F2' },
  rent:            { label: 'Оренда',                 color: '#64748B', bg: '#F8FAFC' },
  salary:          { label: 'Зарплата',               color: '#15803D', bg: '#F0FDF4' },
  marketing:       { label: 'Маркетинг',              color: '#BE185D', bg: '#FDF2F8' },
  opex:            { label: 'Інші витрати',           color: '#64748B', bg: '#F8FAFC' },
};

const SOURCE_LABELS: Record<string, string> = {
  landed_cost: 'Landed cost',
  manual:      'Ручне',
  po:          'Закупівля',
};

function docHref(docType: string, docId: string): string {
  if (docType === 'purchase_order') return `/admin/procurement/${docId}`;
  return `/admin/accounting/documents/${docId}`;
}

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { from, to } = await searchParams;
  const today      = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const dateFrom   = from ?? monthStart;
  const dateTo     = to   ?? today;

  // ── 1. Витрати за період ───────────────────────────────────────────────────
  let query = db
    .from('expenses')
    .select('id, expense_type, description, counterparty, amount, payment_method, business_date, source, source_id, doc_ref')
    .order('business_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (dateFrom) query = query.gte('business_date', dateFrom);
  if (dateTo)   query = query.lte('business_date', dateTo);
  const { data: expenses } = await query.limit(500);

  const rows = expenses ?? [];

  // ── 2. Один bulk-запит до acc_documents для всіх source_id (не N+1) ────────
  const sourceIds = [...new Set(rows.map(r => r.source_id).filter(Boolean))] as string[];
  const { data: sourceDocs } = sourceIds.length
    ? await db
        .from('acc_documents')
        .select('id, doc_number, doc_type, doc_date')
        .in('id', sourceIds)
    : { data: [] };

  const sourceDocMap = new Map(
    (sourceDocs ?? []).map(d => [d.id, {
      doc_number: d.doc_number as string,
      doc_type:   d.doc_type as string,
      doc_date:   d.doc_date as string | null,
    }])
  );

  // ── 3. Підсумки ───────────────────────────────────────────────────────────
  const total  = rows.reduce((s, r) => s + Number(r.amount), 0);
  const byType = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.expense_type] = (acc[r.expense_type] ?? 0) + Number(r.amount);
    return acc;
  }, {});

  const COL = '100px 120px 1fr 160px 110px 120px';

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1300px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Витрати</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Операційні витрати · {rows.length} записів за період
          </p>
        </div>
      </div>

      {/* Date filter */}
      <form method="GET" style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { name: 'from', label: 'З',  value: dateFrom },
          { name: 'to',   label: 'По', value: dateTo   },
        ].map(f => (
          <div key={f.name}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>{f.label}</label>
            <input type="date" name={f.name} defaultValue={f.value}
              style={{ height: '36px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)' }} />
          </div>
        ))}
        <button type="submit" style={{ height: '36px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          Показати
        </button>
      </form>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ padding: '12px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(total)} ₴</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Всього витрат</div>
        </div>
        {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, amount]) => {
          const cfg = EXPENSE_LABELS[type] ?? { label: type, color: '#64748B', bg: '#F8FAFC' };
          return (
            <div key={type} style={{ padding: '12px 18px', borderRadius: '10px', background: cfg.bg }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: cfg.color }}>{fmt(amount)} ₴</div>
              <div style={{ fontSize: '11px', color: cfg.color, opacity: 0.8 }}>{cfg.label}</div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          Немає витрат за обраний період
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>

          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            <span>Дата</span>
            <span>Категорія</span>
            <span>Опис</span>
            <span>Джерело</span>
            <span>Спосіб</span>
            <span style={{ textAlign: 'right' }}>Сума</span>
          </div>

          {rows.map((row, idx) => {
            const cfg    = EXPENSE_LABELS[row.expense_type] ?? { label: row.expense_type, color: '#64748B', bg: '#F8FAFC' };
            const pmLabel: Record<string, string> = { bank: '🏦 Банк', cash: '💵 Готівка', acquiring: '💳 Еквайринг' };

            // Джерело
            const sourceDoc  = row.source_id ? sourceDocMap.get(row.source_id) : null;
            const sourceLabel = SOURCE_LABELS[row.source ?? ''] ?? row.source ?? '—';
            const docRef     = row.doc_ref ?? sourceDoc?.doc_number ?? null;
            const href       = sourceDoc ? docHref(sourceDoc.doc_type, row.source_id!) : null;

            return (
              <div key={row.id} style={{
                display: 'grid', gridTemplateColumns: COL,
                padding: '10px 16px', alignItems: 'center',
                borderBottom: idx < rows.length - 1 ? '1px solid var(--border-light)' : 'none',
              }}>
                {/* Дата */}
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {new Date(row.business_date).toLocaleDateString('uk-UA')}
                </span>

                {/* Категорія */}
                <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: cfg.color, background: cfg.bg, display: 'inline-block', whiteSpace: 'nowrap' }}>
                  {cfg.label}
                </span>

                {/* Опис */}
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>
                  {row.description}
                  {row.counterparty && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: '6px', fontSize: '12px' }}>· {row.counterparty}</span>
                  )}
                </div>

                {/* Джерело — тип + документ-посилання */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sourceLabel}</span>
                  {href && docRef ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      <Link href={href} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                        fontSize: '12px', fontWeight: 600, color: '#1D4ED8',
                        textDecoration: 'none', fontFamily: 'monospace',
                      }}>
                        {docRef}
                        <ExternalLink size={10} />
                      </Link>
                      {sourceDoc?.doc_date && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          · {new Date(sourceDoc.doc_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </span>
                      )}
                    </span>
                  ) : docRef ? (
                    <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{docRef}</span>
                  ) : null}
                </div>

                {/* Спосіб */}
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {pmLabel[row.payment_method] ?? row.payment_method}
                </span>

                {/* Сума */}
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>
                  −{fmt(Number(row.amount))} ₴
                </span>
              </div>
            );
          })}

          {/* Total */}
          <div style={{ padding: '10px 16px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
            <span>Разом за період</span>
            <span style={{ color: '#DC2626' }}>−{fmt(total)} ₴</span>
          </div>
        </div>
      )}
    </div>
  );
}
