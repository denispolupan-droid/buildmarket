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
    .select('id, order_number, status, total_price, created_at, utm_source, utm_medium, utm_campaign, utm_content, referrer_url')
    .gte('created_at', dateFrom)
    .lte('created_at', `${dateTo}T23:59:59`)
    .or('utm_source.not.is.null,referrer_url.not.is.null')
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
    const source = tagged ? o.utm_source! : refHost(o.referrer_url);
    const medium = tagged ? (o.utm_medium ?? '—') : 'реферал';
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

  const COL = 'minmax(140px, 1.4fr) minmax(90px, 0.8fr) minmax(120px, 1.2fr) 90px 110px 120px 110px';

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

      {/* Порахувати окупність без витрат на рекламу не можна, а їх ми не знаємо:
          кабінети Google/Prom нам не доступні. Тому — підказка, а не вигадана цифра. */}
      <div className="fin-card" style={{ marginTop: '16px', padding: '14px 18px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--text-primary)' }}>Як рахувати окупність.</b> Тут видно, скільки принесла кампанія;
        скільки вона коштувала — знає рекламний кабінет. Реклама виправдана, поки «Прибуток» більший за витрату
        на ту саму кампанію за той самий період. Витрати зручно вести у{' '}
        <a href="/admin/finance/expenses" style={{ color: 'var(--brand-blue)', fontWeight: 600 }}>Витратах</a> з категорією «Маркетинг».
      </div>
    </div>
  );
}
