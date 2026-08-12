import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ChevronRight, ShoppingCart, Truck, Coins, Receipt } from 'lucide-react';
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
              {(() => {
                // Живі залишки з банківських API (Mono client-info, NovaPay Business);
                // фолбек без API — обліковий залишок, як раніше.
                const monoShown = ov.monoLive ? ov.monoLive.total : ov.accounts.monobank;
                const npShown = ov.novapayLive ? ov.novapayLive.available : ov.accounts.novapay;
                const shownTotal = monoShown + npShown + ov.accounts.cash;
                const gap = ov.monoLive ? Math.round((ov.monoLive.total - ov.accounts.monobank) * 100) / 100 : null;
                return (
                  <>
                    <div className="fin-money-val" style={{ color: shownTotal >= 0 ? '#15803D' : '#DC2626' }}
                      title={`Mono ${fmt(monoShown)} + НоваПей ${fmt(npShown)} + каса ${fmt(ov.accounts.cash)}`}>
                      {fmt(shownTotal)} ₴
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '6px' }}>
                      {[
                        { label: ov.monoLive ? 'Mono · живий' : 'Mono · за обліком', v: monoShown,
                          title: ov.monoLive ? `Залишок з API Monobank станом на ${new Date(ov.monoLive.fetchedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : undefined },
                        { label: ov.novapayLive ? 'НоваПей · живий' : 'НоваПей · в дорозі', v: npShown,
                          title: ov.novapayLive
                            ? `Доступний залишок рахунку NovaPay станом на ${new Date(ov.novapayLive.fetchedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })} · за обліком у дорозі: ${fmt(ov.accounts.novapay)} ₴`
                            : 'Зібраний накладений платіж, який НоваПей ще не виплатила на рахунок (за обліком)' },
                        { label: 'Каса', v: ov.accounts.cash },
                      ].map(a => (
                        <div key={a.label} title={a.title} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', gap: '8px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{a.label}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: a.v < 0 ? '#DC2626' : 'var(--text-primary)' }}>{fmt(a.v)} ₴</span>
                        </div>
                      ))}
                    </div>
                    {gap !== null && Math.abs(gap) > 1 && (
                      <div className="fin-money-sub" title={`Живий залишок Mono ${fmt(ov.monoLive!.total)} ₴ проти облікового ${fmt(ov.accounts.monobank)} ₴ — частина банківських рухів не заведена в облік`}>
                        розрив з обліком: <span style={{ color: '#B45309', fontWeight: 600 }}>{gap > 0 ? '+' : ''}{fmt(gap)} ₴</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div>
              <div className="fin-kpi-label">Дебіторка · нам винні</div>
              <div className="fin-money-val">{fmt(ov.ar.total)} ₴</div>
              <div className="fin-money-sub" style={ov.ar.overdueCount > 0 ? { color: '#DC2626', fontWeight: 600 } : undefined}>
                {ov.ar.overdueCount > 0 ? `● прострочено ${fmt(ov.ar.overdueSum)} ₴` : 'без прострочень'}
              </div>
              <div className="fin-money-sub"><Link href="/admin/finance/settlements" style={{ color: 'var(--text-muted)' }}>клієнти →</Link></div>
            </div>
            <div>
              <div className="fin-kpi-label">Кредиторка · ми винні</div>
              <div className="fin-money-val" style={{ color: ov.ap.total > 0 ? '#B45309' : undefined }}>{fmt(ov.ap.total)} ₴</div>
              <div className="fin-money-sub"><Link href="/admin/finance/payables" style={{ color: 'var(--text-muted)' }}>постачальники →</Link></div>
            </div>
            <div>
              <div className="fin-kpi-label">Баланс маркетплейсів</div>
              <div className="fin-money-val">{fmt(ov.mp.prom + ov.mp.rozetka)} ₴</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '6px' }}>
                {[
                  { label: 'Prom',    color: '#C2410C', bal: ov.mp.prom,    transit: ov.mpTransit.prom },
                  { label: 'Rozetka', color: '#15803D', bal: ov.mp.rozetka, transit: ov.mpTransit.rozetka },
                ].map(m => (
                  <div key={m.label} title={`Комісії в дорозі −${fmt(m.transit)} ₴ спишуться при доставці → прогноз ${fmt(m.bal - m.transit)} ₴`}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '12px', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ color: m.color, fontWeight: 600 }}>{m.label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right', marginLeft: 'auto' }}>
                      <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(m.bal)} →</span>{' '}
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{fmt(m.bal - m.transit)} ₴</span>
                    </span>
                  </div>
                ))}
              </div>
              {/* Звичайний перенос: місце внизу колонки є, а трикрапка з'їдала суму */}
              {(ov.mpTransit.prom + ov.mpTransit.rozetka) > 0 && (
                <div className="fin-money-sub" title="Комісії по відвантажених, ще не доставлених посилках — площадка спише їх при доставці">
                  в дорозі комісій <span style={{ color: '#B45309', fontWeight: 600, whiteSpace: 'nowrap' }}>−{fmt(ov.mpTransit.prom + ov.mpTransit.rozetka)} ₴</span>
                  {' · '}<Link href="/admin/finance/marketplace-balance" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>деталі →</Link>
                </div>
              )}
            </div>
          </div>
          {(() => {
            // Та сама база, що показана вище: живі залишки (якщо API доступні) + облік
            const moneyShown = (ov.monoLive ? ov.monoLive.total : ov.accounts.monobank)
              + (ov.novapayLive ? ov.novapayLive.available : ov.accounts.novapay)
              + ov.accounts.cash;
            const net = moneyShown + ov.mp.prom + ov.mp.rozetka + ov.ar.total - ov.ap.total;
            return (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}
                title="Рахунки + баланси маркетплейсів + дебіторка − кредиторка">
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  Чиста позиція <span style={{ color: 'var(--text-muted)' }}>· рахунки + МП + нам винні − ми винні</span>
                </span>
                <span style={{ fontSize: '14px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: net >= 0 ? '#15803D' : '#DC2626' }}>
                  {net >= 0 ? '' : '−'}{fmt(Math.abs(net))} ₴
                </span>
              </div>
            );
          })()}
        </div>

        <div className="fin-card" style={{ gridColumn: 'span 4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="fin-card-title">Сьогодні <span className="fin-card-sub">· за Києвом</span></div>
          </div>
          {/* Стрічка дня: подія → сьогоднішнє число → «вчора» для контексту */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '6px' }}>
            {[
              { icon: ShoppingCart, tone: '#1E5AA8', bg: '#EFF4FF', label: 'Нових замовлень',
                value: `${fmt(ov.today.orders)} · ${fmt(ov.today.revenue)} ₴`,
                sub: `вчора: ${fmt(ov.today.yesterday.orders)} · ${fmt(ov.today.yesterday.revenue)} ₴`,
                hint: 'Створені сьогодні (без скасованих) і їх сума' },
              { icon: Truck, tone: '#B45309', bg: '#FEF3C7', label: 'Відправлено посилок',
                value: fmt(ov.today.shipped),
                sub: `вчора: ${fmt(ov.today.yesterday.shipped)}`,
                hint: 'Відправлені сьогодні — включно зі створеними в попередні дні' },
              { icon: Coins, tone: '#15803D', bg: '#DCFCE7', label: 'Надійшло грошей',
                value: `${fmt(ov.today.paidSum)} ₴${ov.today.paidCount ? ` · ${ov.today.paidCount} опл.` : ''}`,
                sub: `вчора: ${fmt(ov.today.yesterday.paidSum)} ₴`,
                hint: 'Живі оплати від клієнтів за сьогодні (COD НоваПей, картки, банк, каса) — зокрема по замовленнях минулих днів' },
              { icon: Receipt, tone: '#64748B', bg: '#F1F5F9', label: 'Середній чек',
                value: ov.today.avgCheck === null ? '—' : `${fmt(ov.today.avgCheck)} ₴`,
                sub: ov.today.yesterday.orders ? `вчора: ${fmt(Math.round(ov.today.yesterday.revenue / ov.today.yesterday.orders))} ₴` : 'вчора: —',
                hint: 'По створених сьогодні замовленнях' },
            ].map(r => {
              const Icon = r.icon;
              return (
                <div key={r.label} title={r.hint}
                  style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '9px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ width: '32px', height: '32px', borderRadius: '9px', background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} color={r.tone} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)' }}>{r.label}</span>
                    <span style={{ display: 'block', fontSize: '15.5px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{r.sub}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* План на місяць — прогрес-бар на всю ширину. Канали звідси прибрані:
          їх показує «Джерела» в каруселі динаміки, деталі — в «Аналітиці». */}
      <PlanCard plan={ov.plan} />

    </div>
  );
}
