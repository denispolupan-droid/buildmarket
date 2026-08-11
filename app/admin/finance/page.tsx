import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import FinanceTabs from './FinanceTabs';
import FinanceActions from './FinanceActions';
import PlanCard from './PlanCard';
import { getOverview } from './overview-data';
import { MonthBars, TrendBadge, DualLineChart } from './overview-charts';

// «Огляд» — перший екран фінансів у стилі BI (Stripe/Metabase): KPI з
// порівнянням до попереднього періоду, воронка, динаміка, action-центр.
// Уся арифметика — в overview-data.ts (сервер, ті самі джерела, що звіти).

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

const CHANNEL_LABELS: Record<string, string> = {
  website: 'Сайт', prom: 'Prom.ua', rozetka: 'Rozetka', b2b: 'Опт (B2B)',
  phone: 'Телефон', retail: 'Роздріб', dropship: 'Дроп', other: 'Інше',
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

export default async function FinanceOverviewPage({ searchParams }: { searchParams: Promise<{ p?: string; d?: string }> }) {
  const { p, d } = await searchParams;
  const chartDays = [7, 30, 90].includes(Number(d)) ? Number(d) : undefined;
  const [ov, arContracts] = await Promise.all([
    getOverview(p, chartDays),
    db.from('ar_balances')
      .select('contract_id, contract_number, customer_id, customer_name, balance')
      .eq('contract_status', 'active')
      .then(r => r.data ?? []),
  ]);

  const contractsForDrawer = arContracts.map(c => ({
    id: c.contract_id, contract_number: c.contract_number,
    customer_id: c.customer_id, customer_name: c.customer_name,
    balance: Number(c.balance),
  }));

  const maxFunnel = Math.max(ov.funnel[0]?.count ?? 0, 1);

  const attention: { tone: 'red' | 'orange' | 'green'; text: string; sub: string; href: string }[] = [];
  if (ov.ar.overdueCount > 0) attention.push({ tone: 'red', text: `${ov.ar.overdueCount} прострочених оплат`, sub: `Сума: ${fmt(ov.ar.overdueSum)} ₴`, href: '/admin/finance/aging' });
  if (ov.attention.pendingPayment.count > 0) attention.push({ tone: 'orange', text: `${ov.attention.pendingPayment.count} замовлень очікують оплати`, sub: `Сума: ${fmt(ov.attention.pendingPayment.sum)} ₴`, href: '/admin' });
  if (ov.attention.awaitingStock.count > 0) attention.push({ tone: 'orange', text: `${ov.attention.awaitingStock.count} замовлень очікують товар`, sub: 'Перевірте надходження', href: '/admin' });
  if (ov.lowStockCount > 0) attention.push({ tone: 'orange', text: `Низький залишок: ${ov.lowStockCount} SKU`, sub: 'Нижче точки дозамовлення', href: '/admin/procurement' });
  if (attention.length === 0) attention.push({ tone: 'green', text: 'Критичних питань немає', sub: 'Борги і залишки в нормі', href: '/admin/finance/aging' });

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1400px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Фінанси</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Операційний центр: факт з обліку, воронка і борги — одним екраном
          </p>
        </div>
        <FinanceActions contracts={contractsForDrawer} />
      </div>

      <FinanceTabs />

      {/* Період */}
      <div className="fin-period-row" style={{ display: 'flex', gap: '8px', margin: '18px 0 20px', alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { key: 'cur_month',  label: 'Цей місяць' },
          { key: 'prev_month', label: 'Минулий місяць' },
          { key: 'quarter',    label: 'Квартал' },
          { key: 'ytd',        label: 'Рік' },
        ].map(pr => (
          <Link key={pr.key} href={pr.key === 'cur_month' ? '/admin/finance' : `/admin/finance?p=${pr.key}`}
            className={'fin-pill' + (ov.preset === pr.key ? ' active' : '')}>
            {pr.label}
          </Link>
        ))}
        <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{ov.periodLabel}</span>
        <a href={`/api/admin/finance/profit-export?from=${ov.from}&to=${ov.to}`} download className="fin-pill export">
          ↓ Excel
        </a>
      </div>

      {/* KPI */}
      <div className="fin-kpi-row">
        {([
          { key: 'ordsum', label: 'Замовлення · сума', value: `${fmt(ov.kpi.orderSum.value)} ₴`, cur: ov.kpi.orderSum.value, prev: ov.kpi.orderSum.prev, months: ov.monthly.orderSum, mFmt: (v: number) => `${fmt(v)} ₴`, color: 'var(--brand-blue)',
            hint: 'Усі підтверджені замовлення, створені за період (без нових і скасованих): в роботі, відвантажені й доставлені. Сума за цінами продажу.' },
          { key: 'prof', label: 'Валовий прибуток', value: `${fmt(ov.kpi.profit.value)} ₴`, cur: ov.kpi.profit.value, prev: ov.kpi.profit.prev, months: ov.monthly.profit, mFmt: (v: number) => `${fmt(v)} ₴`, color: '#15803D',
            hint: 'Виручка − собівартість (FIFO) − комісії МП − доставка НП за наш рахунок' },
          { key: 'mrg',  label: 'Маржа',            value: ov.kpi.margin.value === null ? '—' : `${ov.kpi.margin.value}%`, cur: ov.kpi.margin.value, prev: ov.kpi.margin.prev, months: ov.monthly.margin, mFmt: (v: number) => `${v}%`, pp: true,
            hint: 'Валовий прибуток ÷ виручка (факт, з доставлених)' },
          { key: 'ord',  label: 'Замовлень',        value: fmt(ov.kpi.orders.value), cur: ov.kpi.orders.value, prev: ov.kpi.orders.prev, months: ov.monthly.orders, mFmt: (v: number) => fmt(v), color: 'var(--brand-blue)',
            hint: 'Створені за період, без скасованих — включно з ще не відвантаженими' },
          { key: 'chk',  label: 'Середній чек',     value: ov.kpi.avgCheck.value === null ? '—' : `${fmt(ov.kpi.avgCheck.value)} ₴`, cur: ov.kpi.avgCheck.value, prev: ov.kpi.avgCheck.prev, months: ov.monthly.avgCheck, mFmt: (v: number) => `${fmt(v)} ₴`,
            hint: 'Сума створених замовлень ÷ їх кількість (оцінка до доставки)' },
        ] as { key: string; label: string; value: string; cur: number | null; prev: number | null; months: (number | null)[]; mFmt: (v: number) => string; color?: string; pp?: boolean; hint: string }[]).map(k => (
          <div key={k.key} className="fin-card fin-kpi">
            <div className="fin-kpi-label">{k.label}</div>
            <div className="fin-kpi-value">{k.value}</div>
            <div className="fin-kpi-foot">
              <TrendBadge cur={k.cur} prev={k.prev} pp={k.pp} />
              <span className="fin-kpi-cmp">{ov.prevLabel}</span>
            </div>
            <div className="fin-kpi-spark" title="Останні 6 місяців; кольоровий — поточний">
              <MonthBars values={k.months} labels={ov.monthly.labels} color={k.color} format={k.mFmt} />
            </div>
            <div className="fin-hint">{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Воронка · Динаміка · Потребує уваги */}
      <div className="fin-grid-12" style={{ marginTop: '16px' }}>
        <div className="fin-card" style={{ gridColumn: 'span 4' }}>
          <div className="fin-card-title">Воронка замовлень <span className="fin-card-sub">· створені за період</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '13px', marginTop: '14px' }}>
            {ov.funnel.map(f => (
              <div key={f.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {f.count}<span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {fmt(f.amount)} ₴</span>
                  </span>
                </div>
                <div className="fin-funnel-track">
                  <div className="fin-funnel-fill" style={{ width: `${Math.max(2, Math.round(f.count / maxFunnel * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
          {ov.conversion !== null && (
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Конверсія в доставку: <b style={{ color: 'var(--text-primary)' }}>{ov.conversion}%</b>
            </div>
          )}
        </div>

        <div className="fin-card" style={{ gridColumn: 'span 5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="fin-card-title">
              {ov.chartWindow ? `Динаміка · ${chartDays} днів` : 'Динаміка за період'} <span className="fin-card-sub">· факт з обліку, по днях доставки</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {/* Вікно графіка незалежно від пресета періоду: Період / 7 / 30 / 90 днів */}
              <div style={{ display: 'flex', gap: '3px' }}>
                {[
                  { d: undefined, label: 'Період' },
                  { d: 7,  label: '7д' },
                  { d: 30, label: '30д' },
                  { d: 90, label: '90д' },
                ].map(w => {
                  const params = new URLSearchParams();
                  if (p) params.set('p', p);
                  if (w.d) params.set('d', String(w.d));
                  const qs = params.toString();
                  const active = (w.d ?? undefined) === chartDays;
                  return (
                    <Link key={w.label} href={`/admin/finance${qs ? `?${qs}` : ''}`}
                      style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, textDecoration: 'none',
                        color: active ? '#fff' : 'var(--text-secondary)', background: active ? '#1E3A5F' : 'var(--bg-soft)' }}>
                      {w.label}
                    </Link>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                <span><span className="fin-dot" style={{ background: 'var(--brand-blue)' }} /> Виручка</span>
                <span><span className="fin-dot" style={{ background: '#15803D' }} /> Прибуток</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <DualLineChart
              a={ov.chartWindow ? ov.chartWindow.revenue : ov.kpi.revenue.daily}
              b={ov.chartWindow ? ov.chartWindow.profit : ov.kpi.profit.daily}
              labels={ov.chartWindow ? ov.chartWindow.labels : ov.dayLabels}
              aLabel="Виручка" bLabel="Прибуток" />
          </div>
        </div>

        <div className="fin-card" style={{ gridColumn: 'span 3', padding: '18px' }}>
          <div className="fin-card-title">Потребує уваги <span className="fin-card-sub">· стан на зараз</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '8px' }}>
            {attention.map((a, i) => (
              <Link key={i} href={a.href} className="fin-attn">
                <span className={`fin-dot big ${a.tone}`} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{a.text}</span>
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)' }}>{a.sub}</span>
                </span>
                <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Фінанси · Сьогодні */}
      <div className="fin-grid-12" style={{ marginTop: '16px' }}>
        <div className="fin-card" style={{ gridColumn: 'span 8' }}>
          <div className="fin-card-title">Гроші та борги <span className="fin-card-sub">· залишки з проводок обліку, станом на зараз</span></div>
          <div className="fin-money-grid">
            <div>
              <div className="fin-kpi-label">На рахунках</div>
              <div className="fin-money-val">{fmt(ov.accounts.total)} ₴</div>
              <div className="fin-money-sub">Mono {fmt(ov.accounts.monobank)} · NovaPay {fmt(ov.accounts.novapay)} · Каса {fmt(ov.accounts.cash)}</div>
            </div>
            <div>
              <div className="fin-kpi-label">Дебіторка</div>
              <div className="fin-money-val">{fmt(ov.ar.total)} ₴</div>
              <div className="fin-money-sub">{ov.ar.overdueCount > 0 ? `прострочено ${fmt(ov.ar.overdueSum)} ₴` : 'без прострочень'}</div>
            </div>
            <div>
              <div className="fin-kpi-label">Кредиторка</div>
              <div className="fin-money-val">{fmt(ov.ap.total)} ₴</div>
              <div className="fin-money-sub"><Link href="/admin/finance/payables" style={{ color: 'var(--text-muted)' }}>постачальники →</Link></div>
            </div>
            <div>
              <div className="fin-kpi-label">Баланс маркетплейсів</div>
              <div className="fin-money-val">{fmt(ov.mp.prom + ov.mp.rozetka)} ₴</div>
              <div className="fin-money-sub">Prom {fmt(ov.mp.prom)} · Rozetka {fmt(ov.mp.rozetka)}</div>
            </div>
          </div>
        </div>

        <div className="fin-card" style={{ gridColumn: 'span 4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="fin-card-title">Сьогодні <span className="fin-card-sub">· за Києвом</span></div>
          </div>
          <div className="fin-today-grid">
            {[
              { label: 'Замовлень',    value: fmt(ov.today.orders) },
              { label: 'Виручка',      value: `${fmt(ov.today.revenue)} ₴` },
              { label: 'Відправлено',  value: fmt(ov.today.shipped) },
              { label: 'Оплат',        value: `${ov.today.paidCount} · ${fmt(ov.today.paidSum)} ₴` },
              { label: 'Середній чек', value: ov.today.avgCheck === null ? '—' : `${fmt(ov.today.avgCheck)} ₴` },
            ].map(s => (
              <div key={s.label} className="fin-today-cell">
                <div className="fin-today-val">{s.value}</div>
                <div className="fin-kpi-label" style={{ marginTop: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Канали · План. Деталі (топи, категорії, бренди) — в «Аналітиці»:
          «Огляд» тримає лише загальну картину (рішення власника). */}
      <div className="fin-grid-12" style={{ marginTop: '16px' }}>
        <div className="fin-card" style={{ gridColumn: 'span 8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="fin-card-title">Канали продажів <span className="fin-card-sub">· сума створених замовлень за період (оцінка до доставки)</span></div>
            <Link href="/admin/finance/analytics" style={{ fontSize: '12px', color: 'var(--brand-blue)', textDecoration: 'none', fontWeight: 600 }}>деталі в Аналітиці →</Link>
          </div>
          <div className="fin-chan-grid">
            {ov.channels.map(c => (
              <div key={c.code} className="fin-chan">
                <div className="fin-kpi-label">{CHANNEL_LABELS[c.code] ?? c.code}</div>
                <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(c.revenue)} ₴</div>
                <div className="fin-money-sub">{c.count} зам. · {c.share}%</div>
                <div className="fin-funnel-track" style={{ marginTop: '6px' }}>
                  <div className="fin-funnel-fill" style={{ width: `${Math.max(2, c.share)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <PlanCard plan={ov.plan} />
      </div>

    </div>
  );
}
