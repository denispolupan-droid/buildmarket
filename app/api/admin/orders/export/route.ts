import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireStaff } from '../../../../../lib/auth-guard';
import { fetchAllRows } from '../../../../../lib/db-paginate';
import { kyivDayBounds } from '../../../../../lib/kyiv-date';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { withApi } from '../../../../../lib/api-handler';
import { loadOrderLines, linesOf } from '../../../../../lib/orders/lines-read';

const db = createServiceClient();

const STATUS_LABELS: Record<string, string> = {
  new: 'Нове', confirmed: 'Підтверджено', awaiting_stock: 'Очікує товар',
  picking: 'Збирається', shipped: 'Відправлено', delivered: 'Доставлено',
  cancelled: 'Скасовано',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Готівка', card: 'Карта', invoice: 'Рахунок', bank: 'Банк',
  liqpay: 'LiqPay', mono: 'Monobank', cod: 'Накладений платіж', online: 'Онлайн',
};

async function _GET(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get('status')   ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo   = searchParams.get('dateTo')   ?? '';

  // Межі доби — київські (created_at — timestamptz; рядок без зони PostgREST
  // читає як UTC). Без limit(5000): повна вибірка сторінками, інакше експорт
  // мовчки обрізався (аудит 31.10.2026).
  const orders = await fetchAllRows((f, t) => {
    let query = db.from('orders')
      .select('id, order_number, created_at, status, contact, company, phone, email, channel_code, payment_type, payment_confirmed, delivery_type, delivery_city_name, delivery_address, tracking_number, total_price, comment')
      .order('created_at', { ascending: false }).order('id');
    if (status)   query = query.eq('status', status);
    if (dateFrom) query = query.gte('created_at', kyivDayBounds(dateFrom).start);
    if (dateTo)   query = query.lt('created_at', kyivDayBounds(dateTo).end);
    return query.range(f, t);
  });

  // Позиції — з order_lines (етап D), не з jsonb-кешу items
  const linesByOrder = await loadOrderLines(db, (orders ?? []).map(o => o.id));
  const rows = (orders ?? []).map(o => {
    const items = linesOf(linesByOrder, o.id);
    return {
      '№ замовлення':   o.order_number,
      'Дата':           new Date(o.created_at as string).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' }),
      'Час':            new Date(o.created_at as string).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' }),
      'Статус':         STATUS_LABELS[o.status as string] ?? o.status,
      'Клієнт':         o.contact ?? '',
      'Компанія':       o.company ?? '',
      'Телефон':        o.phone ?? '',
      'Email':          o.email ?? '',
      'Канал':          o.channel_code ?? 'website',
      'Спосіб оплати':  PAYMENT_LABELS[o.payment_type ?? ''] ?? (o.payment_type ?? ''),
      'Оплата підтв.':  o.payment_confirmed ? 'Так' : 'Ні',
      'Тип доставки':   o.delivery_type ?? '',
      // Було o.city — такої колонки немає, «Місто» в експорті завжди було порожнім (типи, 01.11.2026)
      'Місто':          o.delivery_city_name ?? '',
      'Адреса/відд.':   o.delivery_address ?? '',
      'ТТН':            o.tracking_number ?? '',
      'Товарів':        items.length,
      'Товари':         items.map(i => `${i.name} × ${i.qty}`).join('; '),
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

export const GET = withApi('admin/orders/export', _GET);
