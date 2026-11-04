/**
 * Звіт «прогноз прибутку vs факт» по вручених за N днів — те саме, що рахує крон
 * check-invariants, але в консоль і без алерту. Лише читання.
 *
 *   set -a && . ./.env.local && set +a && npx tsx scripts/profit-drift-report.ts [days]
 */
import { createServiceClient } from '../lib/supabase-service';
import { profitEstimateDrift, loadProfitEstimates } from '../lib/accounting/estimate';

async function main() {
  const days = Number(process.argv[2] ?? 30);
  const db = createServiceClient();
  const d = await profitEstimateDrift(db, days);
  console.log(`Вручені за ${days} дн з фактом у леджері: ${d.orders} замовлень`);
  console.log(`виручка ${d.revenue} ₴  прогноз ${d.est} ₴  факт ${d.fact} ₴  дрейф ${d.pct ?? '—'} % валового = ${d.pctOfRevenue ?? '—'} % виручки  ok=${d.ok}`);
  console.log(`закупівля: прогноз ${d.cogs.est} / факт ${d.cogs.fact}; збори площадок: прогноз ${d.fee.est} / факт ${d.fee.fact}`);
  for (const w of d.worst) console.log(`  №${w.orderNumber}: виручка ${w.revenue}, прогноз ${w.estGross}, факт ${w.factGross}, Δ ${w.diff}`);

  // Розклад дрейфу по компонентах і каналах
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: delivered } = await db.from('orders').select('id, order_number, channel_code, total_price, payment_type')
    .eq('status', 'delivered').gte('delivered_at', since).limit(2000);
  const dEst = await loadProfitEstimates(db, delivered ?? []);
  const agg = new Map<string, { n: number; rev: number; estCogs: number; factCogs: number; estFee: number; factFee: number; extra: number }>();
  for (const o of delivered ?? []) {
    const e = dEst.get(o.id); if (!e || e.cogsSource !== 'fact') continue;
    for (const key of ['ВСЬОГО', `${o.channel_code ?? 'website'}/${o.payment_type ?? '?'}`]) {
      const a = agg.get(key) ?? { n: 0, rev: 0, estCogs: 0, factCogs: 0, estFee: 0, factFee: 0, extra: 0 };
      a.n++; a.rev += e.revenue; a.estCogs += e.estimated.cogs; a.factCogs += e.cogs; a.estFee += e.estimated.fee; a.factFee += e.fee; a.extra += e.dealExtra;
      agg.set(key, a);
    }
  }
  const r = (n: number) => Math.round(n);
  console.log('\nканал/оплата            n   виручка  COGS прогноз/факт     комісія прогноз/факт   екв.+збори НП (лише факт)');
  for (const [k, a] of [...agg.entries()].sort((x, y) => y[1].rev - x[1].rev)) {
    console.log(`${k.padEnd(22)} ${String(a.n).padStart(4)} ${String(r(a.rev)).padStart(9)}  ${String(r(a.estCogs)).padStart(8)}/${String(r(a.factCogs)).padEnd(8)}  ${String(r(a.estFee)).padStart(8)}/${String(r(a.factFee)).padEnd(8)}  ${String(r(a.extra)).padStart(8)}`);
  }

  // Невручені зараз: скільки прогнозу і скільки SKU без закупівлі
  const { data: open } = await db.from('orders').select('id, order_number, channel_code, total_price')
    .in('status', ['confirmed', 'awaiting_stock', 'picking', 'shipped']).limit(2000);
  const est = await loadProfitEstimates(db, open ?? []);
  let rev = 0, gross = 0; const unknown = new Set<string>();
  for (const e of est.values()) { rev += e.revenue; gross += e.gross; e.unknownCostSkus.forEach(s => unknown.add(s)); }
  console.log(`Невручені: ${est.size} замовлень, виручка ${Math.round(rev)} ₴, прогноз валового ${Math.round(gross)} ₴ (${rev ? Math.round(gross / rev * 100) : 0} %)`);
  console.log(`SKU без закупівельної ціни серед них: ${unknown.size}${unknown.size ? ' — ' + [...unknown].slice(0, 10).join(', ') : ''}`);
}

main().catch(e => { console.error(e); process.exit(1); });
