import { createClient } from '@supabase/supabase-js';
import { TrendingUp, TrendingDown, ShoppingBag, Package } from 'lucide-react';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const UA_MONTHS = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Серп','Вер','Жов','Лис','Гру'];

const CHANNEL_LABELS: Record<string, string> = {
  website:  'Сайт',
  prom:     'Prom.ua',
  rozetka:  'Rozetka',
  b2b:      'Опт (B2B)',
  phone:    'Телефон',
  retail:   'Роздріб',
  dropship: 'Дроп',
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

export default async function FinancePage() {
  // Останні 6 місяців
  const now      = new Date();
  const sixAgo   = new Date(now);
  sixAgo.setMonth(sixAgo.getMonth() - 5);
  sixAgo.setDate(1); sixAgo.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Замовлення (не нові і не скасовані) за останні 6 місяців
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, status, total_price, created_at, channel_code, items')
    .not('status', 'in', '(new,cancelled)')
    .gte('created_at', sixAgo.toISOString())
    .order('created_at', { ascending: false });

  // Точні дані обліку (якщо є підтверджені продажі)
  const { data: accDocs } = await db
    .from('acc_documents')
    .select('doc_date, total_amount, total_cost, channel_code')
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed')
    .gte('doc_date', sixAgo.toISOString());

  const hasAccData = (accDocs?.length ?? 0) > 0;

  // Собівартість з product_stock
  const allSkus = [...new Set(
    (orders ?? []).flatMap(o => (o.items ?? []).map((i: { sku: string }) => i.sku))
  )];

  const { data: stockPrices } = allSkus.length > 0
    ? await db.from('product_stock').select('sku, price_cost').in('sku', allSkus)
    : { data: [] };

  const { data: productNames } = allSkus.length > 0
    ? await db.from('products').select('sku, name, brand').in('sku', allSkus)
    : { data: [] };

  const costMap  = new Map((stockPrices ?? []).map(s => [s.sku, Number(s.price_cost ?? 0)]));
  const prodMap  = new Map((productNames ?? []).map(p => [p.sku, p]));

  // Розраховуємо собівартість і маржу по кожному замовленню
  type OrderRow = {
    id: string; order_number: number; status: string;
    total_price: number; created_at: string; channel_code: string | null;
    cost: number; margin: number;
    items: { sku: string; qty: number; price: number }[];
  };

  const rows: OrderRow[] = (orders ?? []).map(o => {
    const cost = (o.items ?? []).reduce((s: number, item: { sku: string; qty: number }) =>
      s + (costMap.get(item.sku) ?? 0) * item.qty, 0);
    return { ...o, cost, margin: o.total_price - cost };
  });

  // ── Поточний місяць ────────────────────────────────────────────────────────

  const thisMonthRows = rows.filter(r => r.created_at >= monthStart);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const prevMonthRows  = rows.filter(r => r.created_at >= prevMonthStart && r.created_at < monthStart);

  const sumRevenue = (arr: OrderRow[]) => arr.reduce((s, r) => s + r.total_price, 0);
  const sumCost    = (arr: OrderRow[]) => arr.reduce((s, r) => s + r.cost, 0);
  const sumMargin  = (arr: OrderRow[]) => arr.reduce((s, r) => s + r.margin, 0);

  const cur = { revenue: sumRevenue(thisMonthRows), cost: sumCost(thisMonthRows), margin: sumMargin(thisMonthRows), count: thisMonthRows.length };
  const prv = { revenue: sumRevenue(prevMonthRows), cost: sumCost(prevMonthRows), margin: sumMargin(prevMonthRows), count: prevMonthRows.length };

  const marginPct  = cur.revenue > 0 ? Math.round(cur.margin / cur.revenue * 100) : 0;
  const revDelta   = prv.revenue > 0 ? Math.round((cur.revenue - prv.revenue) / prv.revenue * 100) : null;

  // ── Щомісячні дані (останні 6 місяців) ────────────────────────────────────

  const months: { label: string; key: string; revenue: number; margin: number; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${UA_MONTHS[d.getMonth()]} ${d.getFullYear() !== now.getFullYear() ? d.getFullYear() : ''}`.trim();
    const mRows = rows.filter(r => r.created_at.slice(0, 7) === key);
    months.push({ label, key, revenue: sumRevenue(mRows), margin: sumMargin(mRows), count: mRows.length });
  }

  const maxRevenue = Math.max(...months.map(m => m.revenue), 1);

  // ── Топ товарів по маржі ───────────────────────────────────────────────────

  const skuStats: Record<string, { revenue: number; cost: number; qty: number }> = {};
  for (const row of thisMonthRows) {
    for (const item of (row.items ?? [])) {
      if (!skuStats[item.sku]) skuStats[item.sku] = { revenue: 0, cost: 0, qty: 0 };
      skuStats[item.sku].revenue += item.price * item.qty;
      skuStats[item.sku].cost   += (costMap.get(item.sku) ?? 0) * item.qty;
      skuStats[item.sku].qty    += item.qty;
    }
  }

  const topProducts = Object.entries(skuStats)
    .map(([sku, s]) => ({
      sku, ...s,
      margin:     s.revenue - s.cost,
      margin_pct: s.revenue > 0 ? Math.round((s.revenue - s.cost) / s.revenue * 100) : 0,
      name:       prodMap.get(sku)?.name ?? sku,
      brand:      prodMap.get(sku)?.brand ?? '',
    }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 8);

  // ── По каналах ────────────────────────────────────────────────────────────

  const channelStats: Record<string, { revenue: number; margin: number; count: number }> = {};
  for (const row of thisMonthRows) {
    const ch = row.channel_code ?? 'website';
    if (!channelStats[ch]) channelStats[ch] = { revenue: 0, margin: 0, count: 0 };
    channelStats[ch].revenue += row.total_price;
    channelStats[ch].margin  += row.margin;
    channelStats[ch].count   += 1;
  }
  const channels = Object.entries(channelStats).sort((a, b) => b[1].revenue - a[1].revenue);
  const totalRevenue = channels.reduce((s, [, c]) => s + c.revenue, 0) || 1;

  // ── Render ─────────────────────────────────────────────────────────────────

  const curMonthLabel = `${UA_MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1400px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Фінанси
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {curMonthLabel} · Собівартість розрахована за поточними закупівельними цінами
          {!hasAccData && ' · Дані на основі замовлень (підтверджені документи з\'являться після відвантаження)'}
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          {
            label: 'Виручка', value: `${fmt(cur.revenue)} ₴`,
            sub: revDelta !== null ? `${revDelta >= 0 ? '+' : ''}${revDelta}% до минулого місяця` : 'перший місяць',
            color: '#1E3A5F', bg: '#EFF4FF', icon: TrendingUp, positive: (revDelta ?? 0) >= 0,
          },
          {
            label: 'Собівартість', value: `${fmt(cur.cost)} ₴`,
            sub: `${cur.count} замовлень`,
            color: '#B45309', bg: '#FEF3C7', icon: Package, positive: false,
          },
          {
            label: 'Маржа', value: `${fmt(cur.margin)} ₴`,
            sub: `${marginPct}% від виручки`,
            color: cur.margin >= 0 ? '#15803D' : '#DC2626',
            bg:    cur.margin >= 0 ? '#F0FDF4' : '#FEF2F2',
            icon: cur.margin >= 0 ? TrendingUp : TrendingDown,
            positive: cur.margin >= 0,
          },
          {
            label: 'Замовлень', value: String(cur.count),
            sub: prv.count > 0 ? `${prv.count} минулого місяця` : 'поточний місяць',
            color: '#6366F1', bg: '#EEF2FF', icon: ShoppingBag, positive: true,
          },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: card.color, lineHeight: 1 }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {card.sub}
                  </div>
                </div>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={18} color={card.color} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly chart */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Виручка та маржа по місяцях
          </h2>
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#1E3A5F', display: 'inline-block' }} /> Виручка
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#22C55E', display: 'inline-block' }} /> Маржа
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {months.map(m => (
            <div key={m.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: m.key === `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}` ? 'var(--text-primary)' : 'var(--text-muted)', minWidth: '70px' }}>
                  {m.label}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                  {m.revenue > 0 ? `${fmt(m.revenue)} ₴` : '—'}
                  {m.margin > 0 && <span style={{ color: '#22C55E', marginLeft: '8px' }}>+{fmt(m.margin)} ₴</span>}
                </span>
              </div>
              <div style={{ position: 'relative', height: '24px', background: 'var(--bg-soft)', borderRadius: '6px', overflow: 'hidden' }}>
                {m.revenue > 0 && (
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${Math.max(2, (m.revenue / maxRevenue) * 100)}%`,
                    background: '#1E3A5F', borderRadius: '6px',
                    transition: 'width 0.3s ease',
                  }} />
                )}
                {m.margin > 0 && (
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${Math.max(1, (m.margin / maxRevenue) * 100)}%`,
                    background: '#22C55E', borderRadius: '6px', opacity: 0.85,
                  }} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>

        {/* Top products */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Топ товарів по маржі — {curMonthLabel}
            </h2>
          </div>
          {topProducts.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Немає даних за поточний місяць
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-soft)' }}>
                  {['Товар', 'К-сть', 'Виручка', 'Собів.', 'Маржа'].map(h => (
                    <th key={h} style={{ padding: '8px 16px', textAlign: h === 'Товар' ? 'left' : 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={p.sku} style={{ borderTop: '1px solid var(--border-light)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-soft)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                        {p.brand} {p.name}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.sku}</div>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{p.qty} шт</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(p.revenue)} ₴</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmt(p.cost)} ₴</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: p.margin >= 0 ? '#15803D' : '#DC2626' }}>
                        {p.margin >= 0 ? '+' : ''}{fmt(p.margin)} ₴
                      </span>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.margin_pct}%</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* By channel */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>По каналах</h2>
          </div>
          {channels.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Немає даних
            </div>
          ) : (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {channels.map(([ch, stats]) => {
                const pct = Math.round(stats.revenue / totalRevenue * 100);
                return (
                  <div key={ch}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {CHANNEL_LABELS[ch] ?? ch}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {fmt(stats.revenue)} ₴ <span style={{ color: 'var(--text-muted)' }}>({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--bg-soft)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#1E3A5F', borderRadius: '4px' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: stats.margin >= 0 ? '#15803D' : '#DC2626', marginTop: '3px', textAlign: 'right' }}>
                      маржа: {fmt(stats.margin)} ₴ · {stats.count} замовлень
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
