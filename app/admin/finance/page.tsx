import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import FinanceTabs from './FinanceTabs';
import FinanceActions from './FinanceActions';
import PlanCard from './PlanCard';
import DynamicsCarousel from './DynamicsCarousel';
import { getOverview } from './overview-data';
import { MonthBars, TrendBadge } from './overview-charts';

// «Огляд» — перший екран фінансів у стилі BI (Stripe/Metabase): KPI з
// порівнянням до попереднього періоду, воронка, динаміка, action-центр.
// Уся арифметика — в overview-data.ts (сервер, ті самі джерела, що звіти).

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

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
          { key: 'prof', label: 'Валовий прибуток', value: `${fmt(ov.kpi.profitEst.value)} ₴`, cur: ov.kpi.profitEst.value, prev: ov.kpi.profitEst.prev, months: ov.monthly.profitEst, mFmt: (v: number) => `${fmt(v)} ₴`, color: '#15803D',
            hint: 'Сума замовлень мінус собівартість і комісії маркетплейсів. База — всі замовлення періоду: доставлені за фактом обліку, недоставлені — оцінка. Точний факт — в «Аналітиці».' },
          { key: 'mrg',  label: 'Маржа',            value: ov.kpi.margin.value === null ? '—' : `${ov.kpi.margin.value}%`, cur: ov.kpi.margin.value, prev: ov.kpi.margin.prev, months: ov.monthly.margin, mFmt: (v: number) => `${v}%`, pp: true,
            hint: 'Валовий прибуток ÷ сума замовлень періоду (та сама база — всі замовлення)' },
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
              <span className="fin-kpi-cmp" title={ov.prevLabel}>{ov.prevLabel}</span>
            </div>
            <div className="fin-kpi-spark" title="Останні 6 місяців; кольоровий — поточний">
              <MonthBars values={k.months} labels={ov.monthly.labels} color={k.color} format={k.mFmt} />
            </div>
            <div className="fin-hint">{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Стадії зараз · Динаміка · Потребує уваги */}
      <div className="fin-grid-12" style={{ marginTop: '16px' }}>
        <div className="fin-card" style={{ gridColumn: 'span 4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
            <div className="fin-card-title">У роботі <span className="fin-card-sub">· де гроші зараз</span></div>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
              title="Разом у всіх живих стадіях">
              {fmt(ov.pipeline.reduce((s, p) => s + p.count, 0))} · {fmt(ov.pipeline.reduce((s, p) => s + p.sum, 0))} ₴
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '13px', marginTop: '14px' }}>
            {(() => {
              const maxSum = Math.max(...ov.pipeline.map(s => s.sum), 1);
              return ov.pipeline.map(s => {
                const warn = s.tone === 'warn' && s.count > 0;
                return (
                  <Link key={s.key} href={s.href} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px', gap: '8px' }}>
                      <span style={{ color: warn ? '#B45309' : 'var(--text-secondary)', fontWeight: warn ? 600 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {warn && <span className="fin-dot orange" />}{s.label}
                      </span>
                      <span style={{ fontWeight: 700, color: warn ? '#B45309' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                        {s.count}<span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {fmt(s.sum)} ₴</span>
                        {s.stuck && <span style={{ color: '#B45309', fontWeight: 600, marginLeft: '6px' }}>● {s.stuck}</span>}
                      </span>
                    </div>
                    <div className="fin-funnel-track">
                      <div className="fin-funnel-fill" style={{ width: `${Math.max(2, Math.round(s.sum / maxSum * 100))}%`, background: warn ? '#EA8A00' : undefined }} />
                    </div>
                  </Link>
                );
              });
            })()}
          </div>
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '12.5px', color: 'var(--text-secondary)' }}
            title="Тільки зрілі замовлення періоду (створені понад 10 днів тому): доставлені проти скасованих після відправки. Ті, що ще в дорозі, не рахуються.">
            {ov.buyout.pct === null ? (
              <>Викуп: завершених замовлень за період ще немає</>
            ) : (
              <>Викуп завершених за період: <b style={{ color: ov.buyout.pct >= 90 ? '#15803D' : '#B45309' }}>{ov.buyout.pct}%</b>
                {ov.buyout.refused > 0 && <span style={{ color: '#DC2626' }}> · відмов {ov.buyout.refused} на {fmt(ov.buyout.refusedSum)} ₴</span>}
              </>
            )}
          </div>
        </div>

        <div className="fin-card" style={{ gridColumn: 'span 5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="fin-card-title">
              {ov.chartWindow ? `Динаміка · ${chartDays} днів` : 'Динаміка за період'} <span className="fin-card-sub">· факт з обліку</span>
            </div>
            {/* Вікно даних для «Тижнів» незалежно від пресета: Період / 7 / 30 / 90 днів */}
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
          </div>
          <div style={{ marginTop: '10px' }}>
            <DynamicsCarousel data={ov.dynamics} />
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

      {/* План на місяць — прогрес-бар на всю ширину. Канали звідси прибрані:
          їх показує «Джерела» в каруселі динаміки, деталі — в «Аналітиці». */}
      <PlanCard plan={ov.plan} />

    </div>
  );
}
