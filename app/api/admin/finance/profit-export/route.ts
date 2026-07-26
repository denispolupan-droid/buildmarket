import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { fetchAllRows } from '../../../../../lib/db-paginate';

/**
 * Excel-експорт прибутку по угодах (ФАКТ): доставлені замовлення періоду з цифрами
 * з бухгалтерських проводок — виручка / FIFO-собівартість / комісії МП / доставка НП.
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (за замовчуванням — поточний місяць).
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const now = new Date();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to   = searchParams.get('to')   ?? now.toISOString().slice(0, 10);

  const db = createServiceClient();

  // Доставлені за період (за датою доставки; фолбек — дата створення)
  const orders = await fetchAllRows<{
    id: string; order_number: number; channel_code: string | null; contact: string | null;
    total_price: number; delivered_at: string | null; created_at: string;
  }>((f, t) => db
    .from('orders')
    .select('id, order_number, channel_code, contact, total_price, delivered_at, created_at')
    .eq('status', 'delivered')
    .gte('delivered_at', `${from}T00:00:00`)
    .lte('delivered_at', `${to}T23:59:59`)
    .order('delivered_at', { ascending: true })
    .range(f, t));

  if (!orders.length) {
    return NextResponse.json({ error: 'Немає доставлених замовлень за період' }, { status: 404 });
  }

  // Факти з леджера по всіх замовленнях вибірки
  const ids = orders.map(o => o.id);
  const entries = await fetchAllRows<{ order_id: string; account_type: string; amount: number; doc_type: string | null }>((f, t) => db
    .from('money_entries')
    .select('order_id, account_type, amount, doc_type')
    .in('order_id', ids)
    .in('account_type', ['revenue', 'cogs', 'marketplace_fee', 'logistics'])
    .range(f, t));

  type Fact = { revenue: number; cogs: number; fee: number; delivery: number };
  const factByOrder = new Map<string, Fact>();
  for (const e of entries) {
    const f = factByOrder.get(e.order_id) ?? { revenue: 0, cogs: 0, fee: 0, delivery: 0 };
    const amt = Number(e.amount);
    if (e.account_type === 'revenue') f.revenue -= amt;
    else if (e.account_type === 'cogs') f.cogs += amt;
    else if (e.account_type === 'marketplace_fee') f.fee += amt;
    else if (e.account_type === 'logistics' && e.doc_type === 'delivery_cost') f.delivery += amt;
    factByOrder.set(e.order_id, f);
  }

  const CHANNEL: Record<string, string> = {
    website: 'Сайт', prom: 'Prom.ua', rozetka: 'Rozetka', b2b: 'Опт', phone: 'Телефон', retail: 'Роздріб', dropship: 'Дроп',
  };

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = orders.map(o => {
    const f = factByOrder.get(o.id) ?? { revenue: Number(o.total_price), cogs: 0, fee: 0, delivery: 0 };
    const gross = f.revenue - f.cogs;
    const net = gross - f.fee - f.delivery;
    return {
      '№ замовлення':        o.order_number,
      'Дата доставки':       (o.delivered_at ?? o.created_at).slice(0, 10),
      'Канал':               CHANNEL[o.channel_code ?? 'website'] ?? o.channel_code ?? '',
      'Клієнт':              o.contact ?? '',
      'Виручка, грн':        r2(f.revenue),
      'Собівартість (FIFO)': r2(f.cogs),
      'Комісія МП':          r2(f.fee),
      'Доставка НП (наша)':  r2(f.delivery),
      'Валовий прибуток':    r2(gross),
      'Чистий прибуток':     r2(net),
      'Чистий, %':           f.revenue > 0 ? r2(net / f.revenue * 100) : 0,
    };
  });

  // Підсумковий рядок
  const sum = (k: keyof typeof rows[number]) => r2(rows.reduce((s, r) => s + Number(r[k] ?? 0), 0));
  const totalRevenue = sum('Виручка, грн');
  const totalNet = sum('Чистий прибуток');
  rows.push({
    '№ замовлення': '' as never, 'Дата доставки': '', 'Канал': '', 'Клієнт': 'РАЗОМ',
    'Виручка, грн': totalRevenue,
    'Собівартість (FIFO)': sum('Собівартість (FIFO)'),
    'Комісія МП': sum('Комісія МП'),
    'Доставка НП (наша)': sum('Доставка НП (наша)'),
    'Валовий прибуток': sum('Валовий прибуток'),
    'Чистий прибуток': totalNet,
    'Чистий, %': totalRevenue > 0 ? r2(totalNet / totalRevenue * 100) : 0,
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 26 }, { wch: 12 }, { wch: 16 }, { wch: 11 }, { wch: 16 }, { wch: 15 }, { wch: 14 }, { wch: 9 }];
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
