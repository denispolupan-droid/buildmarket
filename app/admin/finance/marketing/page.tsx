import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import FinanceTabs from '../FinanceTabs';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Звідки прийшли замовлення сайту й що вони принесли.
//
// Мітки вже збирає сайт: lib/utm.ts кладе utm_* у localStorage при першому
// заході, кошик додає їх у замовлення, роут пише в orders.utm_*. Бракувало
// тільки місця, де це видно разом із грошима — без нього рекламу неможливо
// оцінити інакше, ніж «начебто пішло».
//
// Прибуток беремо ЛИШЕ з проведених видаткових: до проведення собівартості за
// FIFO ще немає, і будь-яка цифра тут була б вигадкою. Скільки замовлень чекає
// проведення — показуємо окремо, щоб різниця не виглядала втратою.

type OrderRow = {
  id: string;
  order_number: number;
  status: string;
  total_price: number | null;
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  referrer_url: string | null;
  gclid: string | null;
};

type Bucket = {
  key: string;
  source: string;
  medium: string;
  campaign: string;
  orders: number;
  cancelled: number;
  revenue: number;
  profit: number;
  posted: number;
};

const fmt = (n: number) => Math.round(n).toLocaleString('uk-UA');

/** Домен реферера без www — «google.com», а не «https://www.google.com/search?q=…» */
function refHost(url: string | null): string {
  if (!url) return 'прямий захід';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url.slice(0, 40); }
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { from, to } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const dateFrom = from ?? monthAgo;
  const dateTo = to ?? today;

  // ── 1. Замовлення з міткою або реферером ─────────────────────────────────
  const { data: raw } = await db
    .from('orders')
    .select('id, order_number, status, total_price, created_at, utm_source, utm_medium, utm_campaign, utm_content, referrer_url, gclid')
    .gte('created_at', dateFrom)
    .lte('created_at', `${dateTo}T23:59:59`)
    .or('utm_source.not.is.null,referrer_url.not.is.null,gclid.not.is.null')
    .order('created_at', { ascending: false })
    .limit(1000);

  const orders = (raw ?? []) as OrderRow[];

  // ── 2. Прибуток — із проведених РН цих замовлень ─────────────────────────
  const ids = orders.map(o => o.id);
  const { data: docs } = ids.length
    ? await db.from('acc_documents')
        .select('id, order_id')
        .eq('doc_type', 'sale').eq('status', 'confirmed')
        .in('order_id', ids)
    : { data: [] };

  const docIds = (docs ?? []).map(d => d.id);
  const { data: lines } = docIds.length
    ? await db.from('acc_document_lines')
        .select('document_id, qty, price, cost_price')
        .in('document_id', docIds)
    : { data: [] };

  const profitByDoc = new Map<string, number>();
  for (const l of (lines ?? [])) {
    const gp = (Number(l.price) - Number(l.cost_price ?? 0)) * Number(l.qty);
    profitByDoc.set(l.document_id, (profitByDoc.get(l.document_id) ?? 0) + gp);
  }
  const profitByOrder = new Map<string, number>();
  for (const d of (docs ?? [])) {
    const gp = profitByDoc.get(d.id) ?? 0;
    profitByOrder.set(d.order_id, (profitByOrder.get(d.order_id) ?? 0) + gp);
  }

  // ── 3. Групування ────────────────────────────────────────────────────────
  const buckets = new Map<string, Bucket>();
  for (const o of orders) {
    const tagged = !!o.utm_source;
    // gclid без utm — автотегований клік Google Ads: показуємо рекламою, а не «рефералом google.com»
    const source = tagged ? o.utm_source! : o.gclid ? 'google' : refHost(o.referrer_url);
    const medium = tagged ? (o.utm_medium ?? '—') : o.gclid ? 'cpc (gclid)' : 'реферал';
    const campaign = tagged ? (o.utm_campaign ?? '—') : '—';
    const key = `${source}|${medium}|${campaign}`;
    const b = buckets.get(key) ?? { key, source, medium, campaign, orders: 0, cancelled: 0, revenue: 0, profit: 0, posted: 0 };
    b.orders++;
    if (o.status === 'cancelled') { b.cancelled++; buckets.set(key, b); continue; }
    b.revenue += Number(o.total_price ?? 0);
    if (profitByOrder.has(o.id)) { b.profit += profitByOrder.get(o.id)!; b.posted++; }
    buckets.set(key, b);
  }

  const rows = [...buckets.values()].sort((a, b) => b.revenue - a.revenue);
  const totals = rows.reduce((t, r) => ({
    orders: t.orders + r.orders,
    cancelled: t.cancelled + r.cancelled,
    revenue: t.revenue + r.revenue,
    profit: t.profit + r.profit,
    posted: t.posted + r.posted,
  }), { orders: 0, cancelled: 0, revenue: 0, profit: 0, posted: 0 });
  const live = totals.orders - totals.cancelled;

  // ── 4. Витрати Google Ads за період (ads_spend, крон ads-spend) ────────────
  const { data: spendRaw } = await db
    .from('ads_spend')
    .select('date, campaign_id, campaign_name, channel_type, cost_micros, clicks, conversions')
    .gte('date', dateFrom).lte('date', dateTo);
  type Camp = { name: string; channel: string | null; cost: number; clicks: number; conversions: number };
  const camps = new Map<number, Camp>();
  for (const r of (spendRaw ?? []) as { campaign_id: number; campaign_name: string; channel_type: string | null; cost_micros: number; clicks: number; conversions: number }[]) {
    const c = camps.get(r.campaign_id) ?? { name: r.campaign_name, channel: r.channel_type, cost: 0, clicks: 0, conversions: 0 };
    c.cost += Number(r.cost_micros) / 1e6; c.clicks += r.clicks; c.conversions += Number(r.conversions); c.name = r.campaign_name;
    camps.set(r.campaign_id, c);
  }
  const adsCampaigns = [...camps.values()].filter(c => c.cost > 0 || c.clicks > 0).sort((a, b) => b.cost - a.cost);
  const adsSpendTotal = adsCampaigns.reduce((t, c) => t + c.cost, 0);
  // наш бік: усе, що прийшло з google-реклами (gclid або мітка google з платним medium)
  const isGoogleAds = (o: OrderRow) => !!o.gclid || (o.utm_source?.toLowerCase() === 'google' && !!o.utm_medium && o.utm_medium !== 'organic');
  const gAds = orders.filter(isGoogleAds);
  const gLive = gAds.filter(o => o.status !== 'cancelled');
  const gRevenue = gLive.reduce((t, o) => t + Number(o.total_price ?? 0), 0);
  const gProfit = gLive.reduce((t, o) => t + (profitByOrder.get(o.id) ?? 0), 0);
  const gPosted = gLive.filter(o => profitByOrder.has(o.id)).length;
  // виручка/прибуток по кампанії — за збігом utm_campaign з назвою кампанії
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  const byCampaign = new Map<string, { orders: number; revenue: number; profit: number }>();
  for (const o of gLive) {
    if (!o.utm_campaign) continue;
    const k = norm(o.utm_campaign);
    const v = byCampaign.get(k) ?? { orders: 0, revenue: 0, profit: 0 };
    v.orders++; v.revenue += Number(o.total_price ?? 0); v.profit += profitByOrder.get(o.id) ?? 0;
    byCampaign.set(k, v);
  }

  const COL = 'minmax(140px, 1.4fr) minmax(90px, 0.8fr) minmax(120px, 1.2fr) 90px 110px 120px 110px';
  const ADS_COL = 'minmax(180px, 1.6fr) minmax(90px, 0.8fr) 90px 70px 90px 110px 110px 110px';

  return (
    <div style={{ padding: '20px 24px 40px' }}>
      <FinanceTabs />

      <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: '18px 0 4px' }}>Реклама і джерела</h1>
      <p style={{ margin: '0 0 18px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: '760px' }}>
        Замовлення сайту, у яких відомо, звідки прийшов покупець: мітка <code>utm_*</code> у посиланні або
        сайт-реферер. Замовлення з маркетплейсів сюди не потрапляють — там джерело завжди сам майданчик.
      </p>

      <form style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '18px', flexWrap: 'wrap' }}>
        {[{ name: 'from', label: 'Від', value: dateFrom }, { name: 'to', label: 'До', value: dateTo }].map(f => (
          <div key={f.name}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>{f.label}</div>
            <input type="date" name={f.name} defaultValue={f.value}
              style={{ height: '36px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)' }} />
          </div>
        ))}
        <button type="submit" style={{ height: '36px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          Показати
        </button>
      </form>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div className="fin-card" style={{ padding: '14px 18px' }}>
          <div className="fin-kpi-label">Замовлень</div>
          <div className="fin-money-val">{live}{totals.cancelled > 0 && <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}> · {totals.cancelled} скасовано</span>}</div>
        </div>
        <div className="fin-card" style={{ padding: '14px 18px' }}>
          <div className="fin-kpi-label">Виручка</div>
          <div className="fin-money-val">{fmt(totals.revenue)} ₴</div>
        </div>
        <div className="fin-card" style={{ padding: '14px 18px' }}>
          <div className="fin-kpi-label">Валовий прибуток</div>
          <div className="fin-money-val" style={{ color: '#15803D' }}>{fmt(totals.profit)} ₴</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            з {totals.posted} проведених РН{live > totals.posted && ` · ${live - totals.posted} ще в дорозі`}
          </div>
        </div>
        <div className="fin-card" style={{ padding: '14px 18px' }}>
          <div className="fin-kpi-label">Середній чек</div>
          <div className="fin-money-val">{live ? fmt(totals.revenue / live) : 0} ₴</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="fin-card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6 }}>
          За цей період немає замовлень із відомим джерелом.<br />
          <span style={{ fontSize: '13px' }}>
            Щоб рекламні переходи сюди потрапляли, у посиланнях оголошень має бути мітка —
            напр. <code>fixline.com.ua/shop?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign=germetiky</code>
          </span>
        </div>
      ) : (
        <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Джерело</span>
            <span>Канал</span>
            <span>Кампанія</span>
            <span style={{ textAlign: 'right' }}>Замовлень</span>
            <span style={{ textAlign: 'right' }}>Виручка</span>
            <span style={{ textAlign: 'right' }}>Прибуток</span>
            <span style={{ textAlign: 'right' }}>Сер. чек</span>
          </div>

          {rows.map((r, idx) => {
            const liveOrders = r.orders - r.cancelled;
            return (
              <div key={r.key} style={{
                display: 'grid', gridTemplateColumns: COL, padding: '10px 16px', alignItems: 'center',
                fontSize: '13px', borderBottom: idx < rows.length - 1 ? '1px solid var(--border-light)' : 'none',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.source}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{r.medium}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{r.campaign}</span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {liveOrders}
                  {r.cancelled > 0 && <span style={{ color: 'var(--text-muted)' }}> (−{r.cancelled})</span>}
                </span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(r.revenue)} ₴</span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: r.posted ? '#15803D' : 'var(--text-muted)' }}>
                  {r.posted ? `${fmt(r.profit)} ₴` : '—'}
                </span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                  {liveOrders ? fmt(r.revenue / liveOrders) : 0} ₴
                </span>
              </div>
            );
          })}
        </div>
      )}

      <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '26px 0 4px' }}>Google Ads: витрати і окупність</h2>
      <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: 'var(--text-muted)', maxWidth: '760px', lineHeight: 1.5 }}>
        Витрати тягне щоденний крон з Google Ads API (7 днів назад — Ads дописує конверсії заднім числом).
        Наш бік — замовлення з <code>gclid</code> або міткою google/cpc; рядок кампанії заповнюється грошима,
        коли <code>utm_campaign</code> в оголошенні збігається з назвою кампанії.
      </p>
      {adsCampaigns.length === 0 ? (
        <div className="fin-card" style={{ padding: '20px 24px', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
          За цей період витрат у Google Ads немає (або крон <code>ads-spend</code> ще не ходив — він щодня о 07:40 за Києвом).
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <div className="fin-card" style={{ padding: '14px 18px' }}>
              <div className="fin-kpi-label">Витрачено</div>
              <div className="fin-money-val" style={{ color: '#B91C1C' }}>{fmt(adsSpendTotal)} ₴</div>
            </div>
            <div className="fin-card" style={{ padding: '14px 18px' }}>
              <div className="fin-kpi-label">Замовлень з реклами</div>
              <div className="fin-money-val">{gLive.length}{gAds.length > gLive.length && <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}> · {gAds.length - gLive.length} скас.</span>}</div>
            </div>
            <div className="fin-card" style={{ padding: '14px 18px' }}>
              <div className="fin-kpi-label">Виручка з реклами</div>
              <div className="fin-money-val">{fmt(gRevenue)} ₴</div>
            </div>
            <div className="fin-card" style={{ padding: '14px 18px' }}>
              <div className="fin-kpi-label">Прибуток − витрати</div>
              <div className="fin-money-val" style={{ color: gProfit - adsSpendTotal >= 0 ? '#15803D' : '#B91C1C' }}>{fmt(gProfit - adsSpendTotal)} ₴</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                валовий {fmt(gProfit)} ₴ з {gPosted} проведених{gLive.length > gPosted && ` · ${gLive.length - gPosted} ще в дорозі`}
              </div>
            </div>
          </div>
          <div className="fin-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: ADS_COL, padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Кампанія</span><span>Тип</span>
              <span style={{ textAlign: 'right' }}>Витрати</span>
              <span style={{ textAlign: 'right' }}>Кліки</span>
              <span style={{ textAlign: 'right' }}>Замовлень</span>
              <span style={{ textAlign: 'right' }}>Виручка</span>
              <span style={{ textAlign: 'right' }}>Прибуток</span>
              <span style={{ textAlign: 'right' }}>Результат</span>
            </div>
            {adsCampaigns.map((c, idx) => {
              const ours = byCampaign.get(norm(c.name));
              const net = ours ? ours.profit - c.cost : null;
              return (
                <div key={c.name} style={{ display: 'grid', gridTemplateColumns: ADS_COL, padding: '10px 16px', alignItems: 'center', fontSize: '13px', borderBottom: idx < adsCampaigns.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{c.channel ?? '—'}</span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(c.cost)} ₴</span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.clicks}</span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{ours ? ours.orders : '—'}</span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{ours ? `${fmt(ours.revenue)} ₴` : '—'}</span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{ours ? `${fmt(ours.profit)} ₴` : '—'}</span>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: net == null ? 'var(--text-muted)' : net >= 0 ? '#15803D' : '#B91C1C' }}>
                    {net == null ? 'без мітки' : `${net >= 0 ? '+' : ''}${fmt(net)} ₴`}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Порахувати окупність без витрат на рекламу не можна, а їх ми не знаємо:
          кабінети Google/Prom нам не доступні. Тому — підказка, а не вигадана цифра. */}
      <div className="fin-card" style={{ marginTop: '16px', padding: '14px 18px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--text-primary)' }}>Як читати «Результат».</b> Це валовий прибуток кампанії мінус її витрати; він неповний, поки частина замовлень «ще в дорозі». Тут видно, скільки принесла кампанія;
        скільки вона коштувала — знає рекламний кабінет. Реклама виправдана, поки «Прибуток» більший за витрату
        на ту саму кампанію за той самий період. Витрати зручно вести у{' '}
        <a href="/admin/finance/expenses" style={{ color: 'var(--brand-blue)', fontWeight: 600 }}>Витратах</a> з категорією «Маркетинг».
      </div>
    </div>
  );
}
