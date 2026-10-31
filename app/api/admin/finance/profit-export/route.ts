import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { fetchAllRows } from '../../../../../lib/db-paginate';
import { kyivDayBounds, kyivMonthStart, kyivYmd } from '../../../../../lib/kyiv-date';
import { summarizePL } from '../../../../../lib/accounting/profit-rules';

/**
 * Excel-експорт прибутку по угодах (ФАКТ): доставлені замовлення періоду з цифрами
 * з бухгалтерських проводок — виручка / FIFO-собівартість / комісії МП / еквайринг /
 * доставка й збори НП. Формула — ТА САМА, що на екранах («Звіти», «Огляд»):
 * summarizePL з lib/accounting/profit-rules, по проводках кожного замовлення.
 * Раніше експорт мав власну формулу без еквайрингу й зборів НП і називав
 * результат «чистим прибутком», хоча OPEX/податки не віднімав (аудит 31.10.2026, R1).
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (за замовчуванням — поточний київський місяць).
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const now = new Date();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? kyivMonthStart(now);
  const to   = searchParams.get('to')   ?? kyivYmd(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Дати у форматі YYYY-MM-DD' }, { status: 400 });
  }
  // Межі доби — київські, а не UTC (delivered_at — timestamptz).
  const { start } = kyivDayBounds(from);
  const { end }   = kyivDayBounds(to);

  const db = createServiceClient();

  // Доставлені за період (за датою доставки)
  const orders = await fetchAllRows<{
    id: string; order_number: number; channel_code: string | null; contact: string | null;
    total_price: number; delivered_at: string | null; created_at: string;
  }>((f, t) => db
    .from('orders')
    .select('id, order_number, channel_code, contact, total_price, delivered_at, created_at')
    .eq('status', 'delivered')
    .gte('delivered_at', start)
    .lt('delivered_at', end)
    .order('delivered_at', { ascending: true })
    .order('id')
    .range(f, t));

  if (!orders.length) {
    return NextResponse.json({ error: 'Немає доставлених замовлень за період' }, { status: 404 });
  }

  // Факти з леджера по всіх замовленнях вибірки (усі рахунки «угоди» з profit-rules)
  const ids = orders.map(o => o.id);
  type Entry = { order_id: string; account_type: string; amount: number; doc_type: string | null };
  const entries = await fetchAllRows<Entry>((f, t) => db
    .from('money_entries')
    .select('order_id, account_type, amount, doc_type')
    .in('order_id', ids)
    .in('account_type', ['revenue', 'cogs', 'marketplace_fee', 'acquiring_fee', 'logistics'])
    .order('id')
    .range(f, t));

  const entriesByOrder = new Map<string, Entry[]>();
  for (const e of entries) {
    const arr = entriesByOrder.get(e.order_id) ?? [];
    arr.push(e);
    entriesByOrder.set(e.order_id, arr);
  }

  const CHANNEL: Record<string, string> = {
    website: 'Сайт', prom: 'Prom.ua', rozetka: 'Rozetka', epicentr: 'Епіцентр', b2b: 'Опт', phone: 'Телефон', retail: 'Роздріб', dropship: 'Дроп',
  };

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = orders.map(o => {
    const es = entriesByOrder.get(o.id) ?? [];
    const pl = summarizePL(es);
    // Замовлення без проводок (РН не проведена — ловить інваріант I7) раніше
    // потрапляло в експорт як «виручка = total_price, собівартість 0» → 100 % маржі.
    // Тепер — нулі й примітка; у підсумок воно не додає нічого.
    const noLedger = es.length === 0;
    return {
      '№ замовлення':         o.order_number,
      'Дата доставки':        kyivYmd(new Date(o.delivered_at ?? o.created_at)),
      'Канал':                CHANNEL[o.channel_code ?? 'website'] ?? o.channel_code ?? '',
      'Клієнт':               o.contact ?? '',
      'Сума замовлення':      r2(Number(o.total_price)),
      'Виручка, грн':         pl.revenue,
      'Собівартість (FIFO)':  pl.cogs,
      'Комісія МП':           pl.deal.marketplaceFee,
      'Еквайринг':            pl.deal.acquiringFee,
      'Доставка та збори НП': pl.deal.npDelivery,
      'Валовий прибуток':     pl.grossProfit,
      'Валовий, %':           pl.revenue > 0 ? r2(pl.grossProfit / pl.revenue * 100) : 0,
      'Примітка':             noLedger ? 'немає проводок (РН не проведена)' : '',
    };
  });

  // Підсумковий рядок
  const sum = (k: keyof typeof rows[number]) => r2(rows.reduce((s, r) => s + Number(r[k] ?? 0), 0));
  const totalRevenue = sum('Виручка, грн');
  const totalGross = sum('Валовий прибуток');
  rows.push({
    '№ замовлення': '' as never, 'Дата доставки': '', 'Канал': '', 'Клієнт': 'РАЗОМ',
    'Сума замовлення': sum('Сума замовлення'),
    'Виручка, грн': totalRevenue,
    'Собівартість (FIFO)': sum('Собівартість (FIFO)'),
    'Комісія МП': sum('Комісія МП'),
    'Еквайринг': sum('Еквайринг'),
    'Доставка та збори НП': sum('Доставка та збори НП'),
    'Валовий прибуток': totalGross,
    'Валовий, %': totalRevenue > 0 ? r2(totalGross / totalRevenue * 100) : 0,
    'Примітка': `без проводок: ${rows.filter(r => r['Примітка']).length}`,
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 18 }, { wch: 15 }, { wch: 10 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Прибуток');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="profit_${from}_${to}.xlsx"`,
    },
  });
}
