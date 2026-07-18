import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const STATUS_LABELS: Record<string, string> = {
  new: 'Нове', confirmed: 'Підтверджено', awaiting_stock: 'Очікує товар',
  picking: 'Збирається', shipped: 'Відправлено', delivered: 'Доставлено',
  cancelled: 'Скасовано',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Готівка', card: 'Карта', invoice: 'Рахунок', bank: 'Банк',
  liqpay: 'LiqPay', mono: 'Monobank', cod: 'Накладений платіж', online: 'Онлайн',
};

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get('status')   ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo   = searchParams.get('dateTo')   ?? '';

  let query = db.from('orders').select('*').order('created_at', { ascending: false }).limit(5000);
  if (status)   query = query.eq('status', status);
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
  if (dateTo)   query = query.lte('created_at', `${dateTo}T23:59:59`);

  const { data: orders } = await query;

  const rows = (orders ?? []).map(o => {
    const items = (o.items ?? []) as { name?: string; qty?: number; price?: number }[];
    return {
      '№ замовлення':   o.order_number,
      'Дата':           new Date(o.created_at).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' }),
      'Час':            new Date(o.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' }),
      'Статус':         STATUS_LABELS[o.status] ?? o.status,
      'Клієнт':         o.contact ?? '',
      'Компанія':       o.company ?? '',
      'Телефон':        o.phone ?? '',
      'Email':          o.email ?? '',
      'Канал':          o.channel_code ?? 'website',
      'Спосіб оплати':  PAYMENT_LABELS[o.payment_type ?? ''] ?? (o.payment_type ?? ''),
      'Оплата підтв.':  o.payment_confirmed ? 'Так' : 'Ні',
      'Тип доставки':   o.delivery_type ?? '',
      'Місто':          o.city ?? '',
      'Адреса/відд.':   o.delivery_address ?? '',
      'ТТН':            o.tracking_number ?? '',
      'Товарів':        items.length,
      'Товари':         items.map(i => `${i.name ?? ''} × ${i.qty ?? 1}`).join('; '),
      'Сума, ₴':        Number(o.total_price ?? 0),
      'Примітка':       o.comment ?? '',
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 11 }, { wch: 7 }, { wch: 16 }, { wch: 20 }, { wch: 20 },
    { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 6 }, { wch: 50 }, { wch: 10 }, { wch: 30 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Замовлення');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `orders-${date}${status ? `-${status}` : ''}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
